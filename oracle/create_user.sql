-- Create the schema user for Factory NetMon in an Oracle PDB.
-- Run as SYS / SYSTEM while connected to the PDB (XEPDB1, FREEPDB1, ORCLPDB, ...), e.g.
--   sqlplus sys/<password>@localhost:1521/XEPDB1 as sysdba @oracle\create_user.sql
-- Change the password, then put the same values in .env (ORACLE_USER / ORACLE_PASSWORD).

CREATE USER monitor IDENTIFIED BY monitor
  DEFAULT TABLESPACE users
  QUOTA UNLIMITED ON users;

GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE TO monitor;

-- Lets the API and the worker take a lock while creating tables at startup.
GRANT EXECUTE ON SYS.DBMS_LOCK TO monitor;

EXIT;
