ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS camera_height_cm numeric;

COMMENT ON COLUMN public.reports.camera_height_cm IS
'Perkiraan tinggi kamera dalam sentimeter saat foto laporan diambil; dipakai untuk estimasi damage_level.';
