-- Repair the member roster for Supabase Auth's varchar(255) email column.
-- Replacing the function preserves existing organizations, memberships, and grants.
begin;

create or replace function private.get_organization_members(p_organization_id uuid)
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
      coalesce(u.email::text, ''), m.role, m.created_at
    from public.memberships as m
    join auth.users as u on u.id = m.user_id
    where m.organization_id = p_organization_id
    order by case m.role when 'owner' then 0 when 'manager' then 1 else 2 end,
      m.created_at, m.id;
end;
$$;

notify pgrst, 'reload schema';
commit;
