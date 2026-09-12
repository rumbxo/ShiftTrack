-- ShiftTrack workspace foundation. Apply once through Supabase migrations or
-- the SQL Editor as the database owner. No existing Auth users are modified.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
revoke create on schema private from authenticated;
grant usage on schema private to authenticated;

create table public.organizations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  name text not null check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 1 and 120
  ),
  created_at timestamptz not null default pg_catalog.now()
);

create table public.memberships (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  -- Removal must go through the membership operation before deleting an Auth
  -- account. In particular, deleting an owner cannot orphan their organization.
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('owner', 'manager', 'employee')),
  created_at timestamptz not null default pg_catalog.now(),
  constraint memberships_organization_user_key unique (organization_id, user_id),
  -- This first release supports one workspace per account.
  constraint memberships_user_id_key unique (user_id)
);

create unique index memberships_one_owner_per_organization
  on public.memberships (organization_id) where role = 'owner';
create index memberships_organization_id_idx on public.memberships (organization_id);

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
revoke all on table public.organizations, public.memberships from public, anon, authenticated;
grant select on table public.organizations, public.memberships to authenticated;

-- A private definer helper avoids a membership policy recursively querying
-- itself. It can only return the caller's organization, never another user's.
create function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id from public.memberships as m
  where m.user_id = (select auth.uid());
$$;

create policy members_read_their_organization on public.organizations
  for select to authenticated
  using (id = (select private.current_organization_id()));
create policy members_read_their_memberships on public.memberships
  for select to authenticated
  using (organization_id = (select private.current_organization_id()));

-- Every membership mutation takes the organization lock first so authorization
-- and the ensuing change are checked against one serialized workspace state.
-- This internal helper has no client EXECUTE grant.
create function private.lock_organization_owner(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.organizations as o
  where o.id = p_organization_id for update;
  if not found or not exists (
    select 1 from public.memberships as m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid()) and m.role = 'owner'
  ) then
    raise exception using errcode = '42501', message = 'Only the workspace owner can make this change.';
  end if;
end;
$$;

create function private.create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := pg_catalog.btrim(p_name);
  v_organization_id uuid;
  v_role text;
begin
  if v_name is null or pg_catalog.char_length(v_name) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'Workspace name must contain 1 to 120 characters.';
  end if;

  -- Serializes create/add races for the same account. Email confirmation is
  -- checked in trusted Auth data, not user-editable metadata or supplied roles.
  perform 1 from auth.users as u
  where u.id = v_user_id and u.email is not null
    and u.email_confirmed_at is not null and u.is_anonymous is not true
    and u.deleted_at is null for update;
  if not found then
    raise exception using errcode = '42501', message = 'A confirmed account is required.';
  end if;

  select m.organization_id, m.role into v_organization_id, v_role
  from public.memberships as m where m.user_id = v_user_id;
  if found then
    if v_role = 'owner' then
      -- Retrying a successful creation is safe and does not silently rename it.
      return v_organization_id;
    end if;
    raise exception using errcode = '23505', message = 'This account already belongs to a workspace.';
  end if;

  insert into public.organizations (name) values (v_name)
  returning id into v_organization_id;
  insert into public.memberships (organization_id, user_id, role)
  values (v_organization_id, v_user_id, 'owner');
  return v_organization_id;
end;
$$;

create function private.rename_organization(p_organization_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := pg_catalog.btrim(p_name);
begin
  perform private.lock_organization_owner(p_organization_id);
  if v_name is null or pg_catalog.char_length(v_name) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'Workspace name must contain 1 to 120 characters.';
  end if;
  update public.organizations set name = v_name where id = p_organization_id;
end;
$$;

create function private.add_organization_member(
  p_organization_id uuid, p_email text, p_role text default 'employee'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
  v_user_id uuid;
  v_membership_id uuid;
begin
  perform private.lock_organization_owner(p_organization_id);
  if p_role is null or p_role not in ('manager', 'employee') then
    raise exception using errcode = '22023', message = 'Choose the manager or employee role.';
  end if;
  if v_email is null or pg_catalog.char_length(v_email) not between 3 and 254 then
    raise exception using errcode = '22023', message = 'Enter a valid account email address.';
  end if;

  -- Registered, confirmed accounts only. No invitation or email is sent. All
  -- unavailable targets have the same result, including another workspace's
  -- members, unconfirmed accounts, and ambiguous duplicate Auth email records.
  begin
    select u.id into strict v_user_id from auth.users as u
    where pg_catalog.lower(u.email) = v_email
      and u.email_confirmed_at is not null and u.is_anonymous is not true
      and u.deleted_at is null
    for update;
  exception when no_data_found or too_many_rows then
    raise exception using errcode = 'P0002', message = 'This account is unavailable to add. It must be registered, confirmed, and not already in a workspace.';
  end;
  if exists (select 1 from public.memberships as m where m.user_id = v_user_id) then
    raise exception using errcode = 'P0002', message = 'This account is unavailable to add. It must be registered, confirmed, and not already in a workspace.';
  end if;

  begin
    insert into public.memberships (organization_id, user_id, role)
    values (p_organization_id, v_user_id, p_role)
    returning id into v_membership_id;
  exception when unique_violation then
    raise exception using errcode = 'P0002', message = 'This account is unavailable to add. It must be registered, confirmed, and not already in a workspace.';
  end;
  return v_membership_id;
end;
$$;

create function private.set_organization_member_role(p_membership_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_current_role text;
begin
  select m.organization_id into v_organization_id
  from public.memberships as m where m.id = p_membership_id;
  perform private.lock_organization_owner(v_organization_id);
  select m.role into v_current_role from public.memberships as m
  where m.id = p_membership_id and m.organization_id = v_organization_id for update;
  if not found or v_current_role = 'owner' then
    raise exception using errcode = '42501', message = 'The workspace owner cannot be changed or removed.';
  end if;
  if p_role is null or p_role not in ('manager', 'employee') then
    raise exception using errcode = '22023', message = 'Choose the manager or employee role.';
  end if;
  update public.memberships set role = p_role where id = p_membership_id;
end;
$$;

create function private.remove_organization_member(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_current_role text;
begin
  select m.organization_id into v_organization_id
  from public.memberships as m where m.id = p_membership_id;
  perform private.lock_organization_owner(v_organization_id);
  select m.role into v_current_role from public.memberships as m
  where m.id = p_membership_id and m.organization_id = v_organization_id for update;
  if not found or v_current_role = 'owner' then
    raise exception using errcode = '42501', message = 'The workspace owner cannot be changed or removed.';
  end if;
  delete from public.memberships where id = p_membership_id;
end;
$$;

create function private.get_organization_members(p_organization_id uuid)
returns table (id uuid, user_id uuid, name text, email text, role text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_organization_id is null
    or p_organization_id is distinct from private.current_organization_id() then
    raise exception using errcode = '42501', message = 'Workspace membership is required.';
  end if;
  return query
    select m.id, m.user_id,
      coalesce(
        nullif(pg_catalog.left(pg_catalog.btrim(u.raw_user_meta_data ->> 'full_name'), 80), ''),
        nullif(pg_catalog.split_part(u.email, '@', 1), ''),
        'Teammate'
      ),
      coalesce(u.email, ''), m.role, m.created_at
    from public.memberships as m
    join auth.users as u on u.id = m.user_id
    where m.organization_id = p_organization_id
    order by case m.role when 'owner' then 0 when 'manager' then 1 else 2 end,
      m.created_at, m.id;
end;
$$;

-- The Data API exposes these invoker wrappers. Elevated implementations stay
-- in private, which must not be added to Supabase's exposed API schemas.
create function public.create_organization(p_name text)
returns uuid language sql security invoker set search_path = ''
as $$ select private.create_organization(p_name); $$;

create function public.rename_organization(p_organization_id uuid, p_name text)
returns void language sql security invoker set search_path = ''
as $$ select private.rename_organization(p_organization_id, p_name); $$;

create function public.add_organization_member(p_organization_id uuid, p_email text, p_role text default 'employee')
returns uuid language sql security invoker set search_path = ''
as $$ select private.add_organization_member(p_organization_id, p_email, p_role); $$;

create function public.set_organization_member_role(p_membership_id uuid, p_role text)
returns void language sql security invoker set search_path = ''
as $$ select private.set_organization_member_role(p_membership_id, p_role); $$;

create function public.remove_organization_member(p_membership_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.remove_organization_member(p_membership_id); $$;

create function public.get_organization_members(p_organization_id uuid)
returns table (id uuid, user_id uuid, name text, email text, role text, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_organization_members(p_organization_id); $$;

-- PostgreSQL and older Supabase projects grant function execution broadly by
-- default. Revoke for every function created here before granting exact access.
revoke all on function private.current_organization_id(),
  private.lock_organization_owner(uuid), private.create_organization(text),
  private.rename_organization(uuid, text), private.add_organization_member(uuid, text, text),
  private.set_organization_member_role(uuid, text), private.remove_organization_member(uuid),
  private.get_organization_members(uuid), public.create_organization(text),
  public.rename_organization(uuid, text), public.add_organization_member(uuid, text, text),
  public.set_organization_member_role(uuid, text), public.remove_organization_member(uuid),
  public.get_organization_members(uuid) from public, anon, authenticated;

grant execute on function private.current_organization_id(),
  private.create_organization(text), private.rename_organization(uuid, text),
  private.add_organization_member(uuid, text, text), private.set_organization_member_role(uuid, text),
  private.remove_organization_member(uuid), private.get_organization_members(uuid),
  public.create_organization(text), public.rename_organization(uuid, text),
  public.add_organization_member(uuid, text, text), public.set_organization_member_role(uuid, text),
  public.remove_organization_member(uuid), public.get_organization_members(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
