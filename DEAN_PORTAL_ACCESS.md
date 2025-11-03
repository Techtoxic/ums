# Dean Portal Access Instructions

## ✅ Server Status: RUNNING & WORKING

Both endpoints tested and confirmed working:
- `/api/programs` - ✅ Status 200
- `/api/dean/students` - ✅ Status 200

## 📍 Dean Portal Location

**File Path:** `src/components/dean/DeanDashboard.html`

## 🌐 How to Access

### Option 1: Direct File Access (RECOMMENDED)
Open in browser:
```
http://localhost:5502/dean/DeanDashboard.html
```

### Option 2: Full Path
```
http://localhost:5502/src/components/dean/DeanDashboard.html
```

### Option 3: Local File (If Express static not configured)
```
file:///C:/Users/ADMIN/Desktop/ums/src/components/dean/DeanDashboard.html
```

## 🔧 If Still Getting 404s

The issue might be that Express isn't serving the `src/components` directory properly. 

**Quick Fix:** Add this to your browser bookmarks or type directly:
```
http://127.0.0.1:5502/dean/DeanDashboard.html
```

Or create a simple redirect in `server.js` (already done):
```javascript
app.use(express.static(path.join(__dirname, 'src', 'components')));
```

## ✨ Expected Behavior

When you access the Dean Portal, you should see:
1. "Dean Portal" header
2. Student list loading
3. Search & filter options (Department, Year, Intake)
4. "Add Note" and "View Notes" buttons for each student

## 🐛 Troubleshooting

If you see 404 errors in console but the endpoints work (proven by curl):
- **Issue:** Browser is caching old paths or CORS issue
- **Fix:** Hard refresh (Ctrl + Shift + R) or open in Incognito mode

If students don't load:
- **Issue:** Dean session data not set
- **Fix:** Manually set dean data in browser console:
```javascript
sessionStorage.setItem('deanData', JSON.stringify({
    id: 'dean001',
    name: 'Dean Name',
    role: 'dean'
}));
location.reload();
```

## 🎯 Quick Test

1. Open browser
2. Go to: `http://localhost:5502/dean/DeanDashboard.html`
3. Open DevTools (F12)
4. Check Console - should see "DOM loaded, setting up uploads initialization"
5. Check Network tab - should see successful API calls

## 📝 Dean Login (For Future)

Currently the Dean Portal doesn't have a login page. You can:
1. Access it directly (development mode)
2. Create a dean login similar to student/trainer login
3. Add dean credentials to the existing login.html

Would you like me to create a Dean login page?


