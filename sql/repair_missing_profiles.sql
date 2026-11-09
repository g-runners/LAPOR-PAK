-- Repair profiles for existing Auth users and ensure future users get a profile.
-- Run in Supabase SQL Editor as the project owner. Existing profile roles are preserved.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, nama)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nama', ''), new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, nama)
select
  auth_user.id,
  coalesce(nullif(auth_user.raw_user_meta_data->>'nama', ''), auth_user.email, '')
from auth.users as auth_user
left join public.profiles as profile on profile.id = auth_user.id
where profile.id is null
on conflict (id) do nothing;

notify pgrst, 'reload schema';
