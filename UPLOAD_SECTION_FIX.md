# Student Upload Section - Bug Fixes

## Issues Fixed

### 1. ❌ **ReferenceError: uploadProfilePhoto is not defined**
**Problem**: Functions were not exposed globally, so onclick handlers in HTML couldn't find them.

**Solution**: Exposed all upload functions to window object at the end of `uploadSection.js`:
```javascript
window.uploadProfilePhoto = uploadProfilePhoto;
window.uploadResults = uploadResults;
window.viewUpload = viewUpload;
window.uploadFile = uploadFile;
window.replaceUpload = replaceUpload;
window.initializeUploadsSection = initializeUploadsSection;
```

### 2. ❌ **"Loading your registered units..." stuck forever**
**Problem**: 
- Student data not being retrieved correctly
- API calls failing silently
- No error handling for failed requests

**Solution**:
- Changed `studentData` from constant to function `getStudentData()` to ensure fresh data
- Added comprehensive error handling and logging
- Added user-friendly error messages in UI when loading fails

## Files Modified

### 1. `src/components/student/uploadSection.js`
- Changed API base from hardcoded `http://localhost:5502/api` to relative `/api`
- Converted `studentData` to `getStudentData()` function
- Added extensive console logging for debugging
- Exposed all necessary functions globally
- Added error UI fallbacks for failed API calls

### 2. `src/components/student/StudentPortalTailwind.html`
- Added debug console logs to initialization
- Added 100ms timeout to ensure DOM is ready
- Better error messages in console

### 3. `src/models/StudentUpload.js`
- Fixed duplicate schema index warnings
- Added unique index names
- Made indexes sparse for better performance

## Testing Steps

1. **Login as Student**
2. **Navigate to Uploads Section**
3. **Check Console** for:
   - ✅ "DOM loaded, setting up uploads initialization"
   - ✅ "Upload section loaded and functions exposed globally"
   - ✅ "Uploads link clicked"
   - ✅ "Initializing uploads section..."
   - ✅ "Student data: {admissionNumber: '...', ...}"
   - ✅ "Fetching registrations for student: ..."
   - ✅ "Fetched registrations: [...]"
   - ✅ "Department units: [...]"

4. **Verify Upload Buttons**:
   - Profile Photo upload button should be clickable
   - KCSE/KCPE Results upload buttons should be clickable
   - Registered department units should appear with assessment upload slots

## Expected Behavior

### Profile & Results Upload
- ✅ Click "Upload" button opens file picker
- ✅ Selecting file uploads to S3
- ✅ Status changes to "Uploaded"
- ✅ View and Replace buttons appear

### Unit Assessments
- ✅ Only shows registered department units (not common units)
- ✅ Each unit shows 3 assessment slots + 1 practical slot
- ✅ Upload buttons work for each assessment
- ✅ Files stored in S3 with correct path: `cibec/{unitId}/{studentId}/{fileType}/{YYYY}/{MM}/{timestamp}_{filename}`

## API Endpoints Used

- `GET /api/students/:studentId/registrations` - Get student unit registrations
- `GET /api/student-uploads/:studentId` - Get student's existing uploads
- `POST /api/student-uploads` - Upload new file
- `GET /api/student-uploads/:uploadId/download` - Get presigned URL for viewing

## Common Issues & Solutions

### Issue: "No student data found" in console
**Solution**: Make sure student is logged in and `sessionStorage.getItem('studentData')` contains admission number

### Issue: "Failed to load registrations: 404"
**Solution**: Student needs to register for units first in the Units section

### Issue: No department units showing
**Solution**: All registered units are common units. Only department units allow uploads.

### Issue: Upload button does nothing
**Solution**: Check browser console for errors. Make sure S3 credentials are in `.env`


