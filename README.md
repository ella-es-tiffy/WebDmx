# DMX Web Tester

## Commands

### Start Container
```bash
docker-compose up -d
```

### Stop Container
```bash
docker-compose down
```

### Restart Container
```bash
docker-compose restart
```

### View Logs
```bash
docker-compose logs -f
```

### Rebuild (if you change docker-compose.yml)
```bash
docker-compose up -d --build
```

### Stop & Remove Everything (including volumes)
```bash
docker-compose down -v
```

## Access Points

- **Website:** http://localhost:8080
- **phpMyAdmin:** http://localhost:8081
  - Username: ``
  - Password: ``

## Database Credentials

- **Host:** `db` (from within PHP)
- **Database:** ``
- **User:** ``
- **Password:** ``
- **Root Password:** ``

## File Structure

- `public/` - Your web files (PHP, HTML, CSS, JS)
- `docker-compose.yml` - Docker configuration
- `php.ini` - PHP settings
