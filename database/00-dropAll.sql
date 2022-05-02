-- materialized vue used to filter communes
DROP MATERIALIZED VIEW IF EXISTS communewithsite;
DROP MATERIALIZED VIEW IF EXISTS sitebuffer;

-- imported communes information via json
DROP TABLE IF EXISTS communes;

-- Spatials tables needed by mviewer
DROP TABLE IF EXISTS lineref;
DROP SEQUENCE IF EXISTS lineref_ogc_fid_seq;

DROP TABLE IF EXISTS tdc;
DROP SEQUENCE IF EXISTS tdc_ogc_fid_seq;

DROP TABLE IF EXISTS prf;
DROP SEQUENCE IF EXISTS prf_ogc_fid_seq;

DROP TABLE IF EXISTS mnt;

-- Application tables
DROP TABLE IF EXISTS profil;
DROP TABLE IF EXISTS measure;
DROP TABLE IF EXISTS measure_type;
DROP TABLE IF EXISTS operator;
DROP TABLE IF EXISTS equipment;
DROP TABLE IF EXISTS survey;
DROP TABLE IF EXISTS site; 