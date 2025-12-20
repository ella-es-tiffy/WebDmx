# Claude Development Notes - DMX Web Console

## Important Coding Standards & Best Practices

### ⚠️ CRITICAL RULES - ALWAYS FOLLOW:

#### 1. **Database (MySQL/MariaDB)**
- ✅ **ALWAYS use Prepared Statements** - Never concatenate user input into SQL queries
- ✅ Use parameterized queries with `?` placeholders
- ✅ Example (TypeScript):
  ```typescript
  await pool.execute('SELECT * FROM fixtures WHERE id = ?', [userId]);
  ```
- ✅ Example (PHP):
  ```php
  $stmt = $db->prepare('SELECT * FROM fixtures WHERE id = ?');
  $stmt->bind_param('i', $userId);
  $stmt->execute();
  ```
- ❌ **NEVER EVER** do this: `SELECT * FROM users WHERE id = ${userId}` (SQL Injection!)

#### 2. **CSS Management**
- ✅ **Always use CSS Frameworks** or organized CSS with proper structure
- ✅ Use CSS Variables (`:root`) for theming and consistency
- ✅ Organize CSS in logical sections with clear comments
- ✅ **Cache-Busting**: Add timestamps to CSS/JS includes
  ```php
  <link rel="stylesheet" href="css/styles.css?v=<?php echo time(); ?>">
  ```

#### 3. **PHP Best Practices**
- ✅ Use PHP frameworks or well-structured OOP code
- ✅ Separate concerns (MVC pattern when possible)
- ✅ Use type hints and return types
- ✅ PDO with prepared statements for database access
- ✅ Input validation and sanitization
- ✅ Error handling with try-catch blocks

#### 4. **Security**
- ✅ Validate and sanitize ALL user input
- ✅ Use prepared statements (mentioned above but critical!)
- ✅ Escape output when rendering HTML
- ✅ Use CSRF tokens for forms
- ✅ Implement proper authentication and authorization

## Project-Specific Notes

### DMX Web Console Architecture
- **Backend**: TypeScript + Express + MySQL
- **Frontend**: HTML + Vanilla CSS + Vanilla JavaScript
- **Database**: MySQL/MariaDB with prepared statements
- **Key Features**:
  - DMX512 control via serial (Enttec OpenDMX)
  - Fader console with channel assignment (R,G,B,P,T,W)
  - Drag-rotatable encoders (Pan, Tilt, RGBW)
  - Cue system with playback
  - Fixture management

### Current File Locations
- Frontend: `/Users/tiffy/html/neko/dmx_web/public/`
- Backend: `/Users/tiffy/html/neko/dmx_web/backend/src/`
- Database Schema: `/Users/tiffy/html/neko/dmx_web/backend/database/schema.sql`

### Cache-Busting Implementation
All HTML files that include CSS/JS should be `.php` files with timestamp versioning:
```php
<link rel="stylesheet" href="css/faders.css?v=<?php echo time(); ?>">
<script src="js/faders.js?v=<?php echo time(); ?>"></script>
```

## Reminders
- 🔒 **Security First**: Never trust user input
- 📝 **Prepared Statements**: No exceptions, ever
- 🎨 **CSS Organization**: Use variables and clear structure
- ⚡ **Cache Control**: Timestamp all static resources in development
- 🧪 **Testing**: Validate database queries against SQL injection

---
*Last updated: 2025-12-20*
