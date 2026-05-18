-- White-label: ubah nama default peserta lama ke label generik (hanya jika masih nama legacy)

UPDATE finance_participants
SET display_name = 'Mitra bagi hasil 1'
WHERE id = 'fin-participant-anwar'
  AND display_name IN ('Anwar', 'anwar', 'ANWAR');

UPDATE finance_participants
SET display_name = 'Mitra bagi hasil 2'
WHERE id = 'fin-participant-suri'
  AND display_name IN ('Suri', 'suri', 'SURI');

UPDATE finance_participants
SET display_name = 'Mitra bagi hasil 3'
WHERE id = 'fin-participant-gemi'
  AND display_name IN ('Gemi', 'gemi', 'GEMI');

UPDATE finance_participants
SET display_name = 'Karyawan kasbon 1'
WHERE id = 'fin-participant-cahaya'
  AND display_name IN ('Cahaya', 'cahaya', 'CAHAYA');

UPDATE finance_participants
SET display_name = 'Karyawan kasbon 2'
WHERE id = 'fin-participant-dinil'
  AND display_name IN ('Dinil', 'dinil', 'DINIL');
