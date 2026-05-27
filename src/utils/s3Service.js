const { S3Client, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
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

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET;

const MAX_PRESIGN_SECONDS = 900; // SEV-H-011: 15-minute hard cap

// SEV-H-011: reject any key that could traverse or contain unexpected bytes.
// Allowed: A-Z a-z 0-9 . _ - and / as the folder separator only.
function sanitizeS3Key(key) {
    const k = String(key == null ? '' : key);
    if (
        k.length === 0 ||
        k.includes('..') ||
        k.includes('/./') ||
        k.includes('\0') ||
        k.startsWith('/') ||
        k.endsWith('/') ||
        /[^A-Za-z0-9._/-]/.test(k)
    ) {
        throw new Error('Invalid storage key');
    }
    return k;
}

// SEV-H-011: build a safe Content-Disposition value from a display name.
function dispositionFilename(name) {
    const safe = String(name || 'file').replace(/[\x00-\x1f\x7f"\\]/g, '_').slice(0, 200) || 'file';
    return safe;
}

/**
 * Upload a file to S3
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - Name of the file
 * @param {string} mimeType - MIME type of the file
 * @param {string} folder - Folder path in S3 (e.g., 'tools-of-trade/course_outline')
 * @returns {Promise<{success: boolean, key: string, location: string}>}
 */
async function uploadToS3(fileBuffer, fileName, mimeType, folder = '', options = {}) {
    try {
        if (!BUCKET_NAME) {
            throw new Error('AWS_S3_BUCKET_NAME is not configured in environment variables');
        }

        // SEV-H-011: validate the composed key; reject traversal / bad bytes.
        const key = sanitizeS3Key(folder ? `${folder}/${fileName}` : fileName);

        // SEV-H-011: store untrusted content as a non-executable octet-stream
        // with attachment disposition so a browser never renders it inline.
        // Only image types intended for inline display keep an image type, and
        // even then nosniff is enforced at download time (responseContentType).
        const display = dispositionFilename(options.displayName || fileName);
        const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: key,
            Body: fileBuffer,
            ContentType: options.inlineImage ? (mimeType || 'application/octet-stream') : 'application/octet-stream',
            ContentDisposition: options.inlineImage
                ? `inline; filename="${display}"`
                : `attachment; filename="${display}"`,
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
async function getPresignedUrl(key, expiresIn = MAX_PRESIGN_SECONDS, options = {}) {
    try {
        if (!BUCKET_NAME) {
            throw new Error('AWS_S3_BUCKET_NAME is not configured in environment variables');
        }

        // SEV-H-011: validate key and hard-cap the lifetime at 15 minutes
        // regardless of what the caller asked for.
        const safeKey = sanitizeS3Key(key);
        const ttl = Math.min(Number(expiresIn) || MAX_PRESIGN_SECONDS, MAX_PRESIGN_SECONDS);
        const display = dispositionFilename(options.displayName || safeKey.split('/').pop());

        // SEV-H-011: force a safe response type + disposition on the download,
        // plus nosniff, so untrusted content cannot execute inline.
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: safeKey,
            ResponseContentType: options.inlineImage
                ? (options.contentType || 'application/octet-stream')
                : 'application/octet-stream',
            ResponseContentDisposition: options.inlineImage
                ? `inline; filename="${display}"`
                : `attachment; filename="${display}"`,
            ResponseCacheControl: 'no-store'
        });

        const url = await getSignedUrl(s3Client, command, { expiresIn: ttl });
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
    sanitizeS3Key,
    s3Client,
    BUCKET_NAME
};

