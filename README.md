# University Management System (UMS)

A comprehensive university management system built with Node.js, Express, PostgreSQL (via Drizzle ORM), and modern web technologies.

## Features

### 🎓 **Student Management**
- Student registration and admission system
- **Automatic admission letter generation** with PDF export
- Student portal with course registration
- Unit registration and fee management
- Graduation and attachment applications

### 👨‍🏫 **Staff Management**
- HOD (Head of Department) dashboard
- Trainer management and assignment
- Course and unit management
- Student assignment and monitoring

### 📧 **Communication System**
- **Forgot password system** with OTP and email reset links
- Professional email templates
- Notification system
- Student portal access instructions

### 📄 **Document Generation**
- **Professional admission letters** with institute branding
- PDF export functionality
- Print-ready documents
- Portal login credentials included

### 🌙 **Modern UI/UX**
- **Full dark mode support**
- Mobile responsive design
- Professional dashboards
- Real-time analytics

## 🚀 Setup Instructions

### Prerequisites
- **Node.js** v20 or higher
- **PostgreSQL** database — recommended: a free [Neon](https://neon.tech) project (serverless Postgres). Local Postgres also works.
- **Git**

### Installation Steps

1. **Clone the repository:**
```bash
git clone https://github.com/Techtoxic/ums.git
cd ums
```

2. **Install dependencies** (use `--legacy-peer-deps` because of an `@aws-sdk` peer-dep quirk):
```bash
npm install --legacy-peer-deps
```

3. **Create environment file:**
Copy `env.example` to `.env` and fill in real values:

```env
# Database (PostgreSQL — Neon URL must end with ?sslmode=require)
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require

# JWT (32+ random chars)
JWT_SECRET=replace_with_at_least_32_random_characters
JWT_EXPIRES_IN=2h
SESSION_SECRET=replace_with_at_least_32_random_characters

# Email (Brevo HTTP API — replaces the old Gmail SMTP)
BREVO_API_KEY=
BREVO_SENDER_EMAIL=no-reply@yourdomain.tld
BREVO_SENDER_NAME=EDTTI University Management System

# Server
PORT=5502
NODE_ENV=development
```

4. **Apply database schema:**
```bash
npm run db:migrate   # creates 21 tables on your Postgres instance
npm run db:seed      # idempotent — seeds departments, programs, users, students
```

5. **Run the application:**
```bash
npm run dev
```

6. **Access the system:**
   - **Main URL:** `http://localhost:5502`
   - **Student/Trainer Login:** `http://localhost:5502/login`
   - **HOD Login:** `http://localhost:5502/hod/login`
   - **Admin Login:** `http://localhost:5502/admin/login`
   - **Health check:** `http://localhost:5502/api/health` (returns Postgres latency)

## 🔧 System Architecture

### Backend
- **Node.js & Express.js** - Server framework
- **PostgreSQL** (Neon-hosted) with **Drizzle ORM** - Database and query layer
- **Brevo HTTP API** - Transactional email (replaces the old Gmail SMTP path)
- **Bcrypt.js** - Password hashing
- **Multer** - File uploads

### Frontend
- **HTML5 & CSS3** - Structure and styling
- **Tailwind CSS** - Utility-first CSS framework
- **Inter** (Google Fonts) - Primary typeface
- **Remixicon** - Icon set (auth pages & landing)
- **Shared stylesheet** - `public/css/auth-styles.css` unifies all auth pages
- **JavaScript (ES6+)** - Client-side functionality
- **Chart.js** - Analytics and charts
- **html2pdf.js** - PDF generation

### Database Collections
- Students, Trainers, HODs
- Courses, Units, Unit Registrations
- Password Resets, Notifications
- Tools of Trade, Applications
- System Settings

## 🐘 Database — PostgreSQL via Drizzle ORM

EDTTI UMS runs on **PostgreSQL** (production: a [Neon](https://neon.tech)
serverless project) via [Drizzle ORM](https://orm.drizzle.team/). The schema
lives at `drizzle/schema.js` (21 tables, 9 enums, indexed for the hot reads).
The legacy NoSQL data layer has been retired.

### Schema

21 tables: `users`, `students`, `departments`, `programs`, `units`,
`common_unit_assignments`, `trainer_assignments`, `student_enrollments`,
`unit_registrations`, `tool_requests`, `attachment_applications`,
`graduation_applications`, `notifications`, `student_notes`, `student_uploads`,
`audit_logs`, `system_settings`, `password_resets`, `login_otps`, `payments`
(TEMPORARY), `payslips` (TEMPORARY). The two TEMPORARY tables retain the
legacy flat shape pending a fee-structure redesign.

### npm scripts

```bash
npm run db:generate   # generate a new migration from schema changes
npm run db:migrate    # apply pending migrations to DATABASE_URL
npm run db:push       # dev shortcut: push schema directly (no migration file)
npm run db:seed       # idempotent seed (7 dept / 11 programs / 18 units / 10 users / 7 students)
npm run db:studio     # open Drizzle Studio
npm run db:reset      # custom reset script (see drizzle/reset.js)
```

### Server data layer

`src/db/index.js` opens a single postgres-js pool (max 20, `prepare: false` so
it plays well with PgBouncer/Neon). `src/db/models.js` is a thin facade that
exposes the legacy V1 model API surface (`find`, `findOne`, `create`,
`findByIdAndUpdate`, etc.) on top of Drizzle, with auto camelCase ↔ snake_case
translation, `_id` aliasing for frontend compatibility, bcrypt password
hashing, and `.comparePassword()` on user/student docs.

### Default seeded credentials

| Email | Role | Password |
|---|---|---|
| okmomanyi56@gmail.com | admin | `Admin@2026` |
| calvinnate6@gmail.com | registrar | `Admin@2026` |
| whitenat16@gmail.com + others | trainer | `Trainer@2026` |
| nashonbett18@gmail.com (and `+registrar`) | admin / registrar | `Mt5@2026` |
| Students | student | phone number (e.g. `0712345689`) |

Change these immediately on first login.

## 🎨 Design System & Color Scheme

The UI follows the **EDTTI brand identity** — a maroon-and-gold academic palette
shared across the public landing page (`src/components/landing/Landing.html`) and
every authentication page via the single source of truth at
`public/css/auth-styles.css`.

### Brand Palette

| Token | Hex | Usage |
|---|---|---|
| `--edtti-maroon` | `#7A0C0C` | Primary brand color — headings, buttons, page background, focus rings |
| `--edtti-maroon-dark` | `#5C0808` | Gradient end, button hover/active states |
| `--edtti-gold` | `#D4A017` | Accent — emphasis, gold CTAs, hover highlights |
| `--edtti-gold-light` | `#F4D58D` | Soft accent — taglines, emblem icons on maroon |
| `--edtti-cream` | `#FFF8E7` | Soft surfaces — stat cards, subtle fills |
| `--edtti-text` | `#1F2937` | Primary body text |
| `--edtti-text-light` | `#6B7280` | Secondary / muted text |
| `--edtti-bg-light` | `#F9FAFB` | Light section backgrounds |
| `--edtti-bg-grey` | `#F5F5F5` | Alternate section backgrounds |

### Typography & Icons
- **Font:** Inter (300–800 weights), loaded from Google Fonts
- **Icons:** Remixicon on the landing page and brand chrome; Font Awesome is
  retained on legacy auth pages where icons are toggled by JavaScript

### Conventions
- The maroon gradient (`--edtti-maroon` → `--edtti-maroon-dark`) is the standard
  page background and primary-button fill.
- Gold (`--edtti-gold`) is reserved for accents/CTAs — never large fills.
- Semantic state colors (success green, error red, info blue) are kept as-is for
  usability and are **not** overridden by the brand palette.
- Reusable classes live in `public/css/auth-styles.css`: `.auth-page`,
  `.auth-card`, `.auth-brand`, `.auth-emblem`, `.auth-input`, `.auth-btn-*`,
  `.auth-error/.auth-success`, `.auth-spinner`.

## 📊 Key Features

### Admission Letter System
- **Automatic generation** after student registration
- **Professional template** with institute branding
- **Portal access instructions** included
- **PDF export** and print functionality
- **Dark mode compatibility**

### Forgot Password System
- **Dual method**: OTP via email OR reset link
- **Secure token generation** with expiration
- **Rate limiting** protection
- **Works for all user types**: Students, Trainers, HODs

### Portal Access
- **Students**: Admission number as username. A randomly-generated initial password is emailed to the student at registration and must be changed on first login.
- **Trainers**: Staff ID as username
- **HODs**: Email as username
- **Password change required** on first login

## 🛠️ Troubleshooting

### Common Issues

1. **Postgres Connection Error:**
   - Check `DATABASE_URL` in `.env` — must start with `postgres://` or `postgresql://`
   - For Neon, the URL must end with `?sslmode=require`
   - Hit `/api/health` — it returns the SELECT 1 latency and a `down` status if Postgres is unreachable

2. **Email Not Sending (Brevo):**
   - Confirm `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` are set
   - Sender email must be a verified sender/domain in your Brevo account
   - Check server logs — the email service degrades cleanly and never crashes the app

3. **Port Already in Use:**
   - Change PORT in `.env` file
   - Or kill the process using port 5502

4. **Missing Dependencies:**
   - Run `npm install --legacy-peer-deps` again (the `--legacy-peer-deps` flag is required because of a `@aws-sdk` peer-dep quirk)
   - If still broken, delete `node_modules` and `package-lock.json`, then reinstall

### Debug Mode
The server logs detailed information. Check console output for:
- Database connection status
- Email service initialization
- API request logs
- Error messages

## 📱 User Roles & Access

### Student Portal
- Login with admission number
- View course information
- Register for units
- Check fee status
- Apply for graduation/attachment

### Trainer Dashboard
- Manage assigned students
- View course assignments
- Update student records
- Access tools of trade

### HOD Dashboard
- Department overview
- Trainer management
- Course approval
- Student analytics

### Registrar Portal
- Student admission
- Course management
- System settings
- Generate reports

## 🔐 Security Features

- **Password hashing** with bcrypt
- **Rate limiting** on sensitive endpoints
- **Session management**
- **Input validation** and sanitization
- **SQL injection protection**
- **CORS configuration**

## 📧 Email Templates

Professional email templates included for:
- **OTP codes** for password reset
- **Reset links** for password recovery
- **Welcome emails** for new admissions
- **System notifications**

## 🌟 Recent Updates

- ✅ Admission letter auto-generation
- ✅ PDF export functionality
- ✅ Complete dark mode support
- ✅ Forgot password system
- ✅ Email integration
- ✅ Mobile responsive design
- ✅ Professional UI/UX

## 📞 Support

For technical support or questions:
- Check the console logs for errors
- Verify all environment variables are set (the server validates them via Zod at boot)
- Confirm Postgres is reachable (try `npm run db:studio` or `curl http://localhost:5502/api/health`)
- Review this README for setup instructions

## 🚀 Production Deployment

For production deployment:
1. Use **Neon** (or any managed Postgres) for the database — copy the connection string into `DATABASE_URL` (must include `?sslmode=require`)
2. Configure environment variables for production
3. Set up proper SSL certificates
4. Configure email service with production credentials
5. Set `NODE_ENV=production`

---

**Happy Coding! 🎉**