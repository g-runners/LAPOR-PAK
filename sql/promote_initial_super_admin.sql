-- Bootstrap the first Super Admin after registering and confirming their account.
-- Replace the email below, then run this script in Supabase SQL Editor as project owner.
-- The role guard trigger is temporarily disabled only within this transaction and restored before commit.

begin;

do $$
declare
  target_email text := lower('sakral01ay@gmail.com');
  target_user_id uuid;
  role_guard_exists boolean;
begin
  if target_email = 'ganti_email_daftar' then
    raise exception 'Ganti GANTI_EMAIL_DAFTAR dengan email akun yang sudah terdaftar.';
  end if;

  select id
    into target_user_id
    from auth.users
   where lower(email) = target_email;

  if target_user_id is null then
    raise exception 'Akun dengan email % belum ditemukan. Daftarkan dan konfirmasi akun terlebih dahulu.', target_email;
  end if;

  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'Profil akun belum tersedia. Jalankan sql/repair_missing_profiles.sql terlebih dahulu.';
  end if;

  select exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.profiles'::regclass
       and tgname = 'profiles_guard_role'
       and not tgisinternal
  ) into role_guard_exists;

  if role_guard_exists then
    execute 'alter table public.profiles disable trigger profiles_guard_role';
  end if;
  begin
    update public.profiles
       set role = 'super_admin'
     where id = target_user_id;
  exception when others then
    if role_guard_exists then
      execute 'alter table public.profiles enable trigger profiles_guard_role';
    end if;
    raise;
  end;
  if role_guard_exists then
    execute 'alter table public.profiles enable trigger profiles_guard_role';
  end if;
end
$$;

commit;
