# Research Assistance Database Administration Application

## About

## Deployment Instructions

### install dependencies
```
sudo yum -y install mysql mysql-server git java-1.8.0 nodejs npm openssl
sudo yum -y remove java-1.7.0-openjdk (if exists)
```
### configure mysql
(https://dev.mysql.com/doc/refman/5.7/en/linux-installation-yum-repo.html)
```
sudo service mysqld start
sudo grep 'temporary password' /var/log/mysqld.log
mysql -uroot -p (use temporary password when prompted)
mysql> ALTER USER 'root'@'localhost' IDENTIFIED BY 'new root password';
mysql> CREATE DATABASE rad_admin;
mysql> CREATE USER 'db user name'@'localhost' IDENTIFIED BY 'db user pass';
mysql> GRANT ALL ON rad_admin.* to 'db user name'@'localhost';
```
### install solr
```
sudo mkdir /usr/solr
sudo useradd -r solr
cd /usr/solr
sudo wget http://mirror.cc.columbia.edu/pub/software/apache/lucene/solr/6.3.0/solr-6.3.0.tgz
sudo tar zxf solr-6.3.0
sudo chown -R solr:solr solr-6.3.0
```
### generate https cert and key

#### letsencrypt
(https://blog.lawrencemcdaniel.com/letsencrypt-amazon-linux-apache/)
(https://certbot.eff.org/docs/using.html)


#### self-signed
(https://www.linux.com/learn/creating-self-signed-ssl-certificates-apache-linux)

```
sudo openssl req -new > new.ssl.csr (follow prompts)
sudo openssl rsa -in privkey.pem -out new.cert.key
sudo openssl x509 -in new.cert.csr -out new.cert.cert -req -signkey new.cert.key -days NNN
```
Copy key and cert into desired directory
```
sudo cp new.cert.cert /etc/ssl/certs/server.crt
sudo cp new.cert.key /etc/ssl/private/server.key
```

### install application
```
git clone https://github.com/nmogk/rad-admin.git
npm install
```
### get rad index data
```
tar xcf rad.tar.gz
```
	Copy index data into /usr/solr/solr-6.3.0/server/solr, replacing the default solr.xml
### localize configuration
```
touch .env
vim .env
```
Add entries for the following values:
```
	DBUSER={username of mysql user}
	DBUSERPASS={password for mysql user}
	SESSIONKEY={a random key}
	HTTPPORT={http port}
	HTTPSPORT={https port}
	SSLKEY={path to server private key}
	SSLCERT={path to server certificate}
	AWS_ACCESS_KEY_ID={AWS key}
	AWS_SECRET_ACCESS_KEY={AWS secret}
	BOOTSTRAP_ADMIN={superuser to be created in application} 
	BOOTSTRAP_PASS={password for superuser}
```

### run initial database migration
```
node migration.js
```
### configure iptables/firewall

Open ports 80, and 443 through lightsail (or other relevant) interface

### install startup script
```
Copy radd System V script to /etc/rc.d/init.d
sudo chkconfig radd on
```
## Starting Instructions

### Using System V script
```
sudo service radd start
```

### Manually
```
/usr/solr/solr-6.3.0/bin/solr start
npm start
```
## Upgrade Instructions

```
git pull
npm install (only necessary when dependencies change, but a good idea)
```

### In the event of local changes
```
git fetch
git reset --hard origin/{branch-name}
```