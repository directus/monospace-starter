# The read-only user Monospace connects as. A shell script rather than SQL so the password
# comes from the container's environment instead of the repo. The MySQL image sources this
# during first start, after the schema and seed.
mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE USER IF NOT EXISTS 'monospace_reader'@'%' IDENTIFIED BY '${PORTAL_READER_PASSWORD:-monospace}';
GRANT SELECT ON customer_portal.* TO 'monospace_reader'@'%';
SQL
