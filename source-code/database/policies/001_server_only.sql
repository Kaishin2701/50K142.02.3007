-- Access is through the backend's PostgreSQL server role, never a browser anon key.
-- Enabling RLS with no public policies denies direct Supabase client access.
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['khoa_nghiep_vu','nguoi_dung','phien_dang_nhap','mon','nguyen_lieu','dinh_muc_nguyen_lieu',
 'chuoi_ca_lap','ca_lam','dang_ky_lich_lam_viec','phan_cong_ca','yeu_cau_thay_doi_ca','don_hang','chi_tiet_don_hang',
 'giu_ton_don_hang','giao_dich_thanh_toan','su_kien_thanh_toan','don_nhap_hang','chi_tiet_nhap_hang','phieu_kiem_kho',
 'chi_tiet_phieu_kiem_kho','bao_cao_cuoi_ca','bien_dong_kho','thong_bao'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
 END LOOP;
END $$;
