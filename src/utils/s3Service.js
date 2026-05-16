const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Initialize S3 client
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'eu-north-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

/**
 * Upload a file to S3
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - Name of the file
 * @param {string} mimeType - MIME type of the file
 * @param {string} folder - Folder path in S3 (e.g., 'tools-of-trade/course_outline')
 * @returns {Promise<{success: boolean, key: string, location: string}>}
 */
async function uploadToS3(fileBuffer, fileName, mimeType, folder = '') {
    try {
        if (!BUCKET_NAME) {
            throw new Error('AWS_S3_BUCKET_NAME is not configured in environment variables');
        }

        // Generate unique key with folder structure
        const key = folder ? `${folder}/${fileName}` : fileName;

        const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: key,
            Body: fileBuffer,
            ContentType: mimeType,
            // Make files private by default (use presigned URLs for access)
            ACL: 'private'
        };

        const upload = new Upload({
            client: s3Client,
            params: uploadParams
        });

        const result = await upload.done();

        console.log(`✅ File uploaded successfully to S3: ${key}`);

        return {
            success: true,
            key: key,
            location: result.Location || `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`,
            bucket: BUCKET_NAME
        };
    } catch (error) {
        console.error('❌ Error uploading to S3:', error);
        throw new Error(`S3 upload failed: ${error.message}`);
    }
}

/**
 * Get a presigned URL for downloading a file from S3
 * @param {string} key - S3 object key
 * @param {number} expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns {Promise<string>} - Presigned URL
 */
async function getPresignedUrl(key, expiresIn = 3600) {
    try {
        if (!BUCKET_NAME) {
            throw new Error('AWS_S3_BUCKET_NAME is not configured in environment variables');
        }

        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        });

        const url = await getSignedUrl(s3Client, command, { expiresIn });
        return url;
    } catch (error) {
        console.error('❌ Error generating presigned URL:', error);
        throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
}

/**
 * Delete a file from S3
 * @param {string} key - S3 object key
 * @returns {Promise<{success: boolean}>}
 */
async function deleteFromS3(key) {
    try {
        if (!BUCKET_NAME) {
            throw new Error('AWS_S3_BUCKET_NAME is not configured in environment variables');
        }

        const command = new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        });

        await s3Client.send(command);

        console.log(`✅ File deleted successfully from S3: ${key}`);

        return { success: true };
    } catch (error) {
        console.error('❌ Error deleting from S3:', error);
        throw new Error(`S3 delete failed: ${error.message}`);
    }
}

/**
 * Get file from S3 as a buffer
 * @param {string} key - S3 object key
 * @returns {Promise<Buffer>}
 */
async function getFileFromS3(key) {
    try {
        if (!BUCKET_NAME) {
            throw new Error('AWS_S3_BUCKET_NAME is not configured in environment variables');
        }

        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        });

        const response = await s3Client.send(command);
        
        // Convert stream to buffer
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        
        return Buffer.concat(chunks);
    } catch (error) {
        console.error('❌ Error getting file from S3:', error);
        throw new Error(`Failed to get file from S3: ${error.message}`);
    }
}

/**
 * Check if S3 is properly configured
 * @returns {boolean}
 */
function isS3Configured() {
    return !!(
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY &&
        process.env.AWS_S3_BUCKET_NAME &&
        process.env.AWS_REGION
    );
}

module.exports = {
    uploadToS3,
    getPresignedUrl,
    deleteFromS3,
    getFileFromS3,
    isS3Configured,
    s3Client,
    BUCKET_NAME
};

