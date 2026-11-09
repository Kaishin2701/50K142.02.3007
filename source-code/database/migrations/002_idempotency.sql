-- Retains request metadata only, not canceled order contents.
CREATE TABLE khoa_yeu_cau_api (
 khoa UUID PRIMARY KEY, ma_nguoi_dung UUID NOT NULL REFERENCES nguoi_dung,
 thao_tac TEXT NOT NULL, noi_dung_bam TEXT NOT NULL, ma_tai_nguyen UUID NOT NULL,
 tao_luc TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE khoa_yeu_cau_api ENABLE ROW LEVEL SECURITY;
