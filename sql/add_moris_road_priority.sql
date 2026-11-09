-- MORIS-style road groups and area-based road priority for LAPOR PAK.
-- Run in Supabase SQL Editor. Safe to rerun; this script does not execute automatically.

create table if not exists public.roads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (lower(btrim(name))) stored unique,
  length_cm numeric(12, 2) not null default 10000,
  width_cm numeric(12, 2) not null default 500,
  dimensions_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roads_length_positive check (length_cm is null or length_cm > 0),
  constraint roads_width_positive check (width_cm is null or width_cm > 0)
);

alter table public.roads
  add column if not exists dimensions_verified boolean not null default false;

update public.roads
   set dimensions_verified = true
 where not dimensions_verified
   and length_cm is not null
   and width_cm is not null
   and (length_cm <> 10000 or width_cm <> 500);

update public.roads
   set length_cm = coalesce(length_cm, 10000),
       width_cm = coalesce(width_cm, 500);

alter table public.roads
  alter column length_cm set default 10000,
  alter column width_cm set default 500,
  alter column length_cm set not null,
  alter column width_cm set not null;

comment on column public.roads.dimensions_verified is
  'False while dimensions use the 100 m × 5 m default; set true after staff verification.';

alter table public.reports
  add column if not exists road_name text,
  add column if not exists road_id uuid,
  add column if not exists pothole_length_cm numeric(10, 2),
  add column if not exists pothole_width_cm numeric(10, 2);

alter table public.reports
  add column if not exists pothole_area_cm2 numeric(14, 2)
    generated always as (pothole_length_cm * pothole_width_cm) stored;

create index if not exists reports_road_id_idx on public.reports (road_id);
create index if not exists reports_merged_into_idx on public.reports (merged_into);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reports_road_id_fkey'
      and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports
      add constraint reports_road_id_fkey
      foreign key (road_id) references public.roads(id) on delete set null;
  end if;
end
$$;

create or replace function public.assign_report_road()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.road_name := nullif(regexp_replace(btrim(coalesce(new.road_name, '')), '\s+', ' ', 'g'), '');
  if new.road_name is null then
    new.road_id := null;
    return new;
  end if;

  insert into public.roads (name)
  values (new.road_name)
  on conflict (normalized_name) do nothing;

  select id
    into new.road_id
    from public.roads
   where normalized_name = lower(btrim(new.road_name));

  return new;
end
$$;

drop trigger if exists reports_assign_road on public.reports;
create trigger reports_assign_road
  before insert or update of road_name on public.reports
  for each row execute function public.assign_report_road();

revoke all on function public.assign_report_road() from public, anon, authenticated;

alter table public.roads enable row level security;

drop policy if exists "jalan: semua bisa baca" on public.roads;
create policy "jalan: semua bisa baca"
  on public.roads for select to anon, authenticated
  using (true);

drop policy if exists "jalan: staff ubah dimensi" on public.roads;
create policy "jalan: staff ubah dimensi"
  on public.roads for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

grant select on public.roads to anon, authenticated;
grant update (length_cm, width_cm, dimensions_verified) on public.roads to authenticated;

create or replace view public.road_priorities
with (security_invoker = true)
as
with area_totals as (
  select
    road.id as road_id,
    road.name,
    road.length_cm,
    road.width_cm,
    road.dimensions_verified,
    count(report.pothole_area_cm2) as measured_reports,
    count(report.id) as report_count,
    coalesce(sum(report.pothole_area_cm2), 0)::numeric as pothole_area_cm2
  from public.roads as road
  left join public.reports as report
    on report.road_id = road.id
   and report.merged_into is null
  group by road.id, road.name, road.length_cm, road.width_cm, road.dimensions_verified
),
percentages as (
  select
    *,
    case
      when length_cm > 0 and width_cm > 0 and measured_reports > 0
      then pothole_area_cm2 * 100 / (length_cm * width_cm)
      else null
    end as damage_percentage
  from area_totals
)
select
  road_id,
  name,
  length_cm,
  width_cm,
  report_count,
  measured_reports,
  pothole_area_cm2,
  round(damage_percentage, 2) as damage_percentage,
  case
    when damage_percentage is null then null
    when damage_percentage < 10 then 1
    when damage_percentage < 20 then 2
    when damage_percentage < 30 then 3
    when damage_percentage < 40 then 4
    when damage_percentage < 50 then 5
    when damage_percentage < 60 then 6
    when damage_percentage < 70 then 7
    when damage_percentage < 80 then 8
    when damage_percentage < 90 then 9
    else 10
  end as damage_score,
  dimensions_verified
from percentages;

grant select on public.road_priorities to anon, authenticated;

comment on view public.road_priorities is
  'Road damage percentage = sum of non-duplicate measured pothole areas / road length-width surface area; score bands follow MORIS.';

notify pgrst, 'reload schema';
