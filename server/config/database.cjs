const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vibe-coding-portfolio';
    
    // MongoDB 연결 옵션
    const options = {
      serverSelectionTimeoutMS: 5000, // 5초 타임아웃
    };
    
    const conn = await mongoose.connect(mongoURI, options);
    console.log(`✅ MongoDB 연결 성공: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.error('❌ MongoDB 연결 실패:', error.message);
    console.error('⚠️  MongoDB가 실행되지 않았거나 연결 정보가 잘못되었습니다.');
    console.error('💡 MongoDB를 설치하고 실행하거나, MongoDB Atlas를 사용하세요.');
    console.error('💡 또는 .env 파일에 MONGODB_URI를 설정하세요.');
    // MongoDB 연결 실패해도 서버는 계속 실행 (개발 환경)
    return false;
  }
};

module.exports = { connectDB };

