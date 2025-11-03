# AWS S3 Integration Guide

This guide explains how to set up and use AWS S3 for file storage in the University Management System.

## Overview

The system now supports both **local file storage** and **AWS S3 cloud storage** for uploaded files (PDFs, images, videos). The system automatically detects which storage method to use based on environment configuration.

## Features

- ✅ **Automatic Storage Selection**: Uses S3 if configured, falls back to local storage
- ✅ **Presigned URLs**: Secure, temporary download links for S3 files
- ✅ **File Type Support**: PDFs, DOC, DOCX, JPG, PNG, MP4, and more
- ✅ **Backward Compatibility**: Works with existing local files
- ✅ **Dual Storage Tracking**: Database tracks both S3 and local file locations

## Setup Instructions

### 1. Create an AWS S3 Bucket

1. Log in to [AWS Console](https://console.aws.amazon.com/)
2. Navigate to **S3** service
3. Click **Create bucket**
4. Configure:
   - **Bucket name**: Choose a unique name (e.g., `your-university-uploads`)
   - **Region**: Select your preferred region (e.g., `us-east-1`)
   - **Block Public Access**: Keep all public access blocked (we use presigned URLs)
   - **Bucket Versioning**: Optional (recommended for production)
5. Click **Create bucket**

### 2. Create IAM User for Programmatic Access

1. Navigate to **IAM** service
2. Click **Users** → **Add users**
3. Configure:
   - **User name**: `university-s3-uploader`
   - **Access type**: Check "Programmatic access"
4. Click **Next: Permissions**
5. Click **Attach policies directly**
6. Create a custom policy with these permissions:
   ```json
   {
       "Version": "2012-10-17",
       "Statement": [
           {
               "Effect": "Allow",
               "Action": [
                   "s3:PutObject",
                   "s3:GetObject",
                   "s3:DeleteObject",
                   "s3:ListBucket"
               ],
               "Resource": [
                   "arn:aws:s3:::your-bucket-name/*",
                   "arn:aws:s3:::your-bucket-name"
               ]
           }
       ]
   }
   ```
7. Save the **Access Key ID** and **Secret Access Key** (you'll need these for `.env`)

### 3. Configure Environment Variables

1. Create a `.env` file in your project root (or copy from `.env.example`)
2. Add the following AWS credentials:

```env
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_S3_BUCKET_NAME=your-bucket-name
AWS_REGION=us-east-1
```

**Important**: 
- Replace `your_access_key_id_here` with your IAM Access Key ID
- Replace `your_secret_access_key_here` with your IAM Secret Access Key
- Replace `your-bucket-name` with your S3 bucket name
- Update `AWS_REGION` to match your bucket's region

### 4. Install Dependencies

The AWS SDK packages are already included in `package.json`. If you need to install them:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
```

### 5. Restart Your Server

```bash
npm start
```

## How It Works

### Upload Flow

1. **User uploads a file** (trainer uploads PDF, etc.)
2. **Server checks S3 configuration**:
   - If S3 is configured → Upload to S3
   - If S3 is not configured → Save locally
3. **Database record created** with:
   - `storageType`: `'s3'` or `'local'`
   - `s3Key`: S3 object key (if S3)
   - `s3Bucket`: Bucket name (if S3)
   - `filePath`: S3 URL or local path

### Download Flow

1. **User clicks download**
2. **Frontend requests**: `/api/tools/{toolId}/download`
3. **Server checks storage type**:
   - If S3 → Generate presigned URL (valid for 1 hour)
   - If local → Return local file path
4. **Frontend initiates download**

### Delete Flow

1. **User deletes a file**
2. **Server checks storage type**:
   - If S3 → Delete from S3 bucket
   - If local → Delete from filesystem
3. **Database record deleted**

## File Structure

```
uploads/                    # Local storage (fallback)
  └── tools-of-trade/
      ├── course_outline/
      ├── learning_plan/
      └── ...

S3 Bucket/                  # Cloud storage (preferred)
  └── tools-of-trade/
      ├── course_outline/
      ├── learning_plan/
      └── ...
```

## Supported File Types

| Category | Types | Max Size |
|----------|-------|----------|
| Documents | PDF, DOC, DOCX | 10MB |
| Images | JPG, PNG | 10MB |
| Videos | MP4, MPEG, MOV | 10MB |

*Note: You can adjust max size in `server.js` (multer config)*

## Troubleshooting

### Files Not Uploading to S3

1. **Check environment variables**:
   ```bash
   # In your terminal
   echo $AWS_ACCESS_KEY_ID
   echo $AWS_SECRET_ACCESS_KEY
   echo $AWS_S3_BUCKET_NAME
   ```

2. **Check IAM permissions**: Ensure your IAM user has `s3:PutObject` permission

3. **Check bucket name**: Ensure it matches exactly in `.env`

4. **Check server logs**: Look for error messages in console

### Downloads Not Working

1. **Check presigned URL expiry**: URLs are valid for 1 hour by default
2. **Check bucket permissions**: Ensure bucket is not blocking the IAM user
3. **Check CORS settings**: If downloading from browser, add CORS policy to bucket

### Existing Files Not Working

- **Old files** (uploaded before S3 setup) will still work with local storage
- **New files** will use S3 automatically
- The system handles both seamlessly

## Migration from Local to S3

If you want to migrate existing local files to S3:

1. Create a migration script or manually upload files to S3
2. Update database records:
   ```javascript
   // Example update
   {
     storageType: 's3',
     s3Key: 'tools-of-trade/course_outline/file-123.pdf',
     s3Bucket: 'your-bucket-name',
     filePath: 'https://your-bucket-name.s3.region.amazonaws.com/...'
   }
   ```

## Security Best Practices

1. ✅ **Never commit `.env` to Git** (already in `.gitignore`)
2. ✅ **Use presigned URLs** instead of public bucket access
3. ✅ **Rotate IAM credentials** periodically
4. ✅ **Enable bucket versioning** for file recovery
5. ✅ **Enable S3 access logging** for audit trails
6. ✅ **Use separate buckets** for dev/staging/production

## Cost Optimization

- **S3 pricing** is pay-per-use:
  - Storage: ~$0.023/GB/month
  - PUT requests: ~$0.005 per 1,000 requests
  - GET requests: ~$0.0004 per 1,000 requests
  
- **Tips**:
  - Set lifecycle policies to archive old files
  - Use S3 Intelligent-Tiering for automatic cost optimization
  - Monitor usage with AWS Cost Explorer

## Support

For issues or questions:
1. Check server logs for error messages
2. Verify AWS credentials and permissions
3. Contact your AWS administrator for IAM/bucket access issues

## Future Enhancements

Planned features:
- [ ] Support for other cloud providers (Azure, Google Cloud)
- [ ] Direct browser uploads to S3 (bypassing server)
- [ ] Automatic thumbnail generation for images
- [ ] Video transcoding for optimized streaming
- [ ] File encryption at rest

