# University Management System (UMS)

A comprehensive university management system built with Node.js, Express, MongoDB, and modern web technologies.

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
- **Node.js** (v14 or higher)
- **MongoDB** (installed and running)
- **MongoDB Compass** (optional, for database management)
- **Git**

### Installation Steps

1. **Clone the repository:**
```bash
git clone https://github.com/Techtoxic/ums.git
cd ums
```

2. **Install dependencies:**
```bash
npm install
```

3. **Create environment file:**
Create a `.env` file in the root directory with the following content:

```env
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/university_management

# Email Configuration (Gmail)
EMAIL_USER=your_email@gmail.com
EMAIL_APP_PASSWORD=your_app_password

# Server Configuration
PORT=5502
NODE_ENV=development
```

4. **Email Setup (Important!):**
   - Use a Gmail account for sending emails
   - Enable 2-Factor Authentication on your Gmail
   - Generate an App Password: Google Account > Security > 2-Step Verification > App passwords
   - Use the 16-character app password (not your regular password)

5. **Start MongoDB:**
   - Ensure MongoDB service is running
   - Default connection: `mongodb://localhost:27017`

6. **Run the application:**
```bash
node server.js
```

7. **Access the system:**
   - **Main URL:** `http://localhost:5502`
   - **Student/Trainer Login:** `http://localhost:5502/login`
   - **HOD Login:** `http://localhost:5502/hod/login`
   - **Registrar Dashboard:** `http://localhost:5502/src/components/registrar/RegistrarDashboardNew.html`

## 🔧 System Architecture

### Backend
- **Node.js & Express.js** - Server framework
- **MongoDB with Mongoose** - Database and ODM
- **Nodemailer** - Email service
- **Bcrypt.js** - Password hashing
- **Multer** - File uploads

### Frontend
- **HTML5 & CSS3** - Structure and styling
- **Tailwind CSS** - Utility-first CSS framework
- **JavaScript (ES6+)** - Client-side functionality
- **Chart.js** - Analytics and charts
- **html2pdf.js** - PDF generation

### Database Collections
- Students, Trainers, HODs
- Courses, Units, Unit Registrations
- Password Resets, Notifications
- Tools of Trade, Applications
- System Settings

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
- **Students**: Admission number as username, phone as initial password
- **Trainers**: Staff ID as username
- **HODs**: Email as username
- **Password change required** on first login

## 🛠️ Troubleshooting

### Common Issues

1. **MongoDB Connection Error:**
   - Ensure MongoDB service is running
   - Check connection string in `.env`
   - Verify MongoDB is accessible on port 27017

2. **Email Not Sending:**
   - Verify Gmail credentials in `.env`
   - Use App Password, not regular password
   - Check Gmail 2FA is enabled

3. **Port Already in Use:**
   - Change PORT in `.env` file
   - Or kill process using port 5502

4. **Missing Dependencies:**
   - Run `npm install` again
   - Delete `node_modules` and `package-lock.json`, then reinstall

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
- Verify all environment variables are set
- Ensure MongoDB and Node.js are properly installed
- Review this README for setup instructions

## 🚀 Production Deployment

For production deployment:
1. Use MongoDB Atlas for cloud database
2. Configure environment variables for production
3. Set up proper SSL certificates
4. Configure email service with production credentials
5. Set `NODE_ENV=production`

---

**Happy Coding! 🎉**