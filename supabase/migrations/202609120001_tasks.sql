-- Saved workspace tasks. Apply after both organization migrations.
-- Recurrence is completion-driven: completing an occurrence creates the next
-- future occurrence. No background scheduler or email is required.
begin;

-- The composite key makes cross-workspace assignment impossible even for an
-- accidental privileged write. Removing a member clears only the assignee.
alter table public.memberships add constraint memberships_organization_id_id_key
  unique (organization_id, id);

create table public.tasks (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  title text not null check (title = pg_catalog.btrim(title) and pg_catalog.char_length(title) between 1 and 160),
  description text not null default '' check (pg_catalog.char_length(description) <= 2000),
  category text not null check (category in ('Safety', 'Operations', 'Documentation', 'Maintenance', 'Team')),
  assignee_id uuid,
  due_at timestamptz not null check (due_at >= '0001-01-01 00:00:00+00'::timestamptz and due_at < '9999-01-01 00:00:00+00'::timestamptz),
  frequency text not null default 'once' check (frequency in ('once', 'daily', 'weekly', 'monthly')),
  time_zone text not null default 'UTC' check (pg_catalog.char_length(time_zone) between 1 and 100),
  recurrence_anchor_at timestamptz not null,
  parent_task_id uuid unique references public.tasks(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  constraint tasks_assignee_membership_fkey foreign key (organization_id, assignee_id)
    references public.memberships(organization_id, id) on delete set null (assignee_id),
  constraint tasks_completion_actor_check check (completed_at is not null or completed_by is null)
);
create index tasks_organization_due_idx on public.tasks (organization_id, due_at, id);
create index tasks_assignee_idx on public.tasks (assignee_id) where assignee_id is not null;

alter table public.tasks enable row level security;
revoke all on table public.tasks from public, anon, authenticated;
grant select on table public.tasks to authenticated;
create policy members_read_their_tasks on public.tasks
  for select to authenticated
  using (organization_id = (select private.current_organization_id()));

-- Use the same organization lock as membership administration. Authorization
-- is checked after acquiring it, so a concurrent removal or role change cannot
-- leave a task mutation authorized by a stale membership.
create function private.lock_task_member(p_organization_id uuid)
returns public.memberships
language plpgsql security definer set search_path = ''
as $$
declare
  v_member public.memberships;
begin
  perform 1 from public.organizations as o where o.id = p_organization_id for update;
  select m.* into v_member from public.memberships as m
  where m.organization_id = p_organization_id and m.user_id = (select auth.uid());
  if not found then
    raise exception using errcode = '42501', message = 'Workspace membership is required.';
  end if;
  return v_member;
end;
$$;

create function private.validate_task_input(
  p_organization_id uuid, p_title text, p_description text, p_category text,
  p_assignee_id uuid, p_due_at timestamptz, p_frequency text, p_time_zone text
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_title is null or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 1 and 160
    or p_description is null or pg_catalog.char_length(pg_catalog.btrim(p_description)) > 2000
    or p_category is null or p_category not in ('Safety', 'Operations', 'Documentation', 'Maintenance', 'Team')
    or p_frequency is null or p_frequency not in ('once', 'daily', 'weekly', 'monthly') then
    raise exception using errcode = '22023', message = 'Enter valid task details.';
  end if;
  if p_due_at is null or not pg_catalog.isfinite(p_due_at)
    or p_due_at < '0001-01-01 00:00:00+00'::timestamptz
    or p_due_at >= '9999-01-01 00:00:00+00'::timestamptz then
    raise exception using errcode = '22023', message = 'Enter a valid due date.';
  end if;
  if p_time_zone is null or pg_catalog.char_length(p_time_zone) not between 1 and 100
    or not exists (select 1 from pg_catalog.pg_timezone_names as z where z.name = p_time_zone) then
    raise exception using errcode = '22023', message = 'Choose a valid time zone.';
  end if;
  if p_assignee_id is not null and not exists (
    select 1 from public.memberships as m
    where m.id = p_assignee_id and m.organization_id = p_organization_id
  ) then
    raise exception using errcode = '22023', message = 'Assign the task to a current workspace member.';
  end if;
end;
$$;

-- Calculate from the original local date/time instead of adding fixed UTC
-- hours or repeatedly adding one month to a clamped date. This preserves a
-- January 31 anchor through February and across daylight-saving changes.
-- PostgreSQL resolves nonexistent/ambiguous local times using its standard
-- time preference; subsequent occurrences still use the original wall time.
create function private.next_task_due(
  p_anchor_at timestamptz, p_previous_due_at timestamptz, p_frequency text,
  p_time_zone text, p_completed_at timestamptz
)
returns timestamptz
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_anchor timestamp := pg_catalog.timezone(p_time_zone, p_anchor_at);
  v_cutoff timestamptz := greatest(p_previous_due_at, p_completed_at);
  v_cutoff_local timestamp := pg_catalog.timezone(p_time_zone, v_cutoff);
  v_candidate timestamp;
  v_due timestamptz;
  v_month timestamp;
  v_number integer;
  v_days integer;
begin
  if p_frequency = 'once' then return null; end if;
  if p_frequency in ('daily', 'weekly') then
    v_days := case p_frequency when 'daily' then 1 else 7 end;
    v_number := greatest(1, (v_cutoff_local::date - v_anchor::date) / v_days);
  elsif p_frequency = 'monthly' then
    v_number := greatest(1,
      (extract(year from v_cutoff_local)::integer - extract(year from v_anchor)::integer) * 12
      + extract(month from v_cutoff_local)::integer - extract(month from v_anchor)::integer);
  else
    raise exception using errcode = '22023', message = 'Choose a valid repeat schedule.';
  end if;
  loop
    if p_frequency = 'monthly' then
      v_month := pg_catalog.date_trunc('month', v_anchor) + pg_catalog.make_interval(months => v_number);
      v_candidate := v_month::date + (least(extract(day from v_anchor)::integer,
        extract(day from (v_month + interval '1 month - 1 day'))::integer) - 1) + v_anchor::time;
    else
      v_candidate := v_anchor + pg_catalog.make_interval(days => v_number * v_days);
    end if;
    v_due := pg_catalog.timezone(p_time_zone, v_candidate);
    if v_due > v_cutoff then return v_due; end if;
    v_number := v_number + 1;
  end loop;
end;
$$;

create function private.create_task(
  p_organization_id uuid, p_title text, p_description text, p_category text,
  p_assignee_id uuid, p_due_at timestamptz, p_frequency text default 'once', p_time_zone text default 'UTC'
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_member public.memberships;
  v_id uuid;
begin
  v_member := private.lock_task_member(p_organization_id);
  if v_member.role not in ('owner', 'manager') then
    raise exception using errcode = '42501', message = 'Only owners and managers can create tasks.';
  end if;
  perform private.validate_task_input(p_organization_id, p_title, p_description, p_category,
    p_assignee_id, p_due_at, p_frequency, p_time_zone);
  insert into public.tasks (organization_id, title, description, category, assignee_id,
    due_at, frequency, time_zone, recurrence_anchor_at, created_by)
  values (p_organization_id, pg_catalog.btrim(p_title), pg_catalog.btrim(p_description),
    p_category, p_assignee_id, p_due_at, p_frequency, p_time_zone, p_due_at, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create function private.update_task(
  p_task_id uuid, p_title text, p_description text, p_category text,
  p_assignee_id uuid, p_due_at timestamptz, p_frequency text, p_time_zone text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_member public.memberships;
  v_task public.tasks;
begin
  select t.organization_id into v_organization_id from public.tasks as t where t.id = p_task_id;
  v_member := private.lock_task_member(v_organization_id);
  if v_member.role not in ('owner', 'manager') then
    raise exception using errcode = '42501', message = 'Only owners and managers can edit tasks.';
  end if;
  select t.* into v_task from public.tasks as t where t.id = p_task_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'This task is unavailable.';
  end if;
  if v_task.completed_at is not null then
    raise exception using errcode = '55000', message = 'Completed tasks cannot be edited.';
  end if;
  perform private.validate_task_input(v_organization_id, p_title, p_description, p_category,
    p_assignee_id, p_due_at, p_frequency, p_time_zone);
  update public.tasks set title = pg_catalog.btrim(p_title), description = pg_catalog.btrim(p_description),
    category = p_category, assignee_id = p_assignee_id, due_at = p_due_at,
    frequency = p_frequency, time_zone = p_time_zone,
    recurrence_anchor_at = case when p_due_at is distinct from v_task.due_at
      or p_frequency is distinct from v_task.frequency or p_time_zone is distinct from v_task.time_zone
      then p_due_at else v_task.recurrence_anchor_at end
  where id = p_task_id;
  return p_task_id;
end;
$$;

create function private.complete_task(p_task_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_member public.memberships;
  v_task public.tasks;
  v_completed_at timestamptz;
  v_next_due_at timestamptz;
begin
  select t.organization_id into v_organization_id from public.tasks as t where t.id = p_task_id;
  v_member := private.lock_task_member(v_organization_id);
  select t.* into v_task from public.tasks as t where t.id = p_task_id for update;
  if not found or (v_member.role = 'employee' and v_task.assignee_id is distinct from v_member.id) then
    raise exception using errcode = '42501', message = 'You can only complete a task assigned to you.';
  end if;
  -- Retrying a response lost in transit preserves the original completion and
  -- cannot create a second successor, even when requests arrive concurrently.
  if v_task.completed_at is not null then return p_task_id; end if;
  v_completed_at := pg_catalog.clock_timestamp();
  v_next_due_at := private.next_task_due(v_task.recurrence_anchor_at, v_task.due_at,
    v_task.frequency, v_task.time_zone, v_completed_at);
  if v_next_due_at is not null and v_next_due_at >= '9999-01-01 00:00:00+00'::timestamptz then
    raise exception using errcode = '22023', message = 'The next due date is outside the supported range.';
  end if;
  update public.tasks set completed_at = v_completed_at, completed_by = auth.uid() where id = p_task_id;
  if v_next_due_at is not null then
    insert into public.tasks (organization_id, title, description, category, assignee_id,
      due_at, frequency, time_zone, recurrence_anchor_at, parent_task_id, created_by)
    values (v_task.organization_id, v_task.title, v_task.description, v_task.category, v_task.assignee_id,
      v_next_due_at, v_task.frequency, v_task.time_zone, v_task.recurrence_anchor_at, v_task.id, v_task.created_by);
  end if;
  return p_task_id;
end;
$$;

create function private.delete_task(p_task_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_member public.memberships;
  v_task public.tasks;
begin
  select t.organization_id into v_organization_id from public.tasks as t where t.id = p_task_id;
  v_member := private.lock_task_member(v_organization_id);
  if v_member.role not in ('owner', 'manager') then
    raise exception using errcode = '42501', message = 'Only owners and managers can delete tasks.';
  end if;
  select t.* into v_task from public.tasks as t where t.id = p_task_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'This task is unavailable.';
  end if;
  if v_task.completed_at is not null then
    raise exception using errcode = '55000', message = 'Completed tasks cannot be deleted.';
  end if;
  delete from public.tasks where id = p_task_id;
end;
$$;

create function public.create_task(
  p_organization_id uuid, p_title text, p_description text, p_category text,
  p_assignee_id uuid, p_due_at timestamptz, p_frequency text default 'once', p_time_zone text default 'UTC'
)
returns uuid language sql security invoker set search_path = ''
as $$ select private.create_task(p_organization_id, p_title, p_description, p_category,
  p_assignee_id, p_due_at, p_frequency, p_time_zone); $$;

create function public.update_task(
  p_task_id uuid, p_title text, p_description text, p_category text,
  p_assignee_id uuid, p_due_at timestamptz, p_frequency text, p_time_zone text
)
returns uuid language sql security invoker set search_path = ''
as $$ select private.update_task(p_task_id, p_title, p_description, p_category,
  p_assignee_id, p_due_at, p_frequency, p_time_zone); $$;

create function public.complete_task(p_task_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select private.complete_task(p_task_id); $$;

create function public.delete_task(p_task_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.delete_task(p_task_id); $$;

revoke all on function private.lock_task_member(uuid),
  private.validate_task_input(uuid, text, text, text, uuid, timestamptz, text, text),
  private.next_task_due(timestamptz, timestamptz, text, text, timestamptz),
  private.create_task(uuid, text, text, text, uuid, timestamptz, text, text),
  private.update_task(uuid, text, text, text, uuid, timestamptz, text, text),
  private.complete_task(uuid), private.delete_task(uuid),
  public.create_task(uuid, text, text, text, uuid, timestamptz, text, text),
  public.update_task(uuid, text, text, text, uuid, timestamptz, text, text),
  public.complete_task(uuid), public.delete_task(uuid) from public, anon, authenticated;

grant execute on function
  private.create_task(uuid, text, text, text, uuid, timestamptz, text, text),
  private.update_task(uuid, text, text, text, uuid, timestamptz, text, text),
  private.complete_task(uuid), private.delete_task(uuid),
  public.create_task(uuid, text, text, text, uuid, timestamptz, text, text),
  public.update_task(uuid, text, text, text, uuid, timestamptz, text, text),
  public.complete_task(uuid), public.delete_task(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
