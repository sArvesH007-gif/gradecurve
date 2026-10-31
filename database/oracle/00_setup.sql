-- Run from SQL*Plus in a fresh GradeCurve Oracle schema.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON SIZE UNLIMITED
@@01_create_tables.sql
@@02_constraints.sql
@@03_insert_sample_data.sql
@@05_plsql_procedures.sql
@@06_plsql_functions.sql
@@07_plsql_cursors.sql
@@08_plsql_triggers.sql
@@09_plsql_packages.sql
PROMPT GradeCurve Oracle schema, sample data, procedures, functions, cursors, trigger, and package installed.
