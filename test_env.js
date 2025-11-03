require('dotenv').config();

console.log('🔍 Environment Variable Test:');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'SET' : 'NOT SET');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? 'SET' : 'NOT SET');
console.log('PORT:', process.env.PORT ? 'SET' : 'NOT SET');

if (process.env.MONGODB_URI) {
    console.log('📊 MONGODB_URI starts with:', process.env.MONGODB_URI.substring(0, 30) + '...');
    console.log('🌐 Database type:', process.env.MONGODB_URI.includes('localhost') ? 'LOCAL' : 'ATLAS CLOUD');
} else {
    console.log('❌ MONGODB_URI not found in environment variables');
    console.log('💡 Please update your .env file with the Atlas connection string');
}





