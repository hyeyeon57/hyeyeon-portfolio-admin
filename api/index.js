// Vercel 서버리스 함수로 Express 서버 래핑
const express = require('express');
const cors = require('cors');
const path = require('path');
const { existsSync, mkdirSync, readdirSync } = require('fs');
const multer = require('multer');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

// 상대 경로로 모듈 import (Vercel과 로컬 모두 지원)
let connectDB, Project, Visitor, Contact;

try {
  // Vercel: __dirname은 /var/task/api, ../server는 /var/task/server
  // 로컬: __dirname은 api/, ../server는 server/
  const dbModule = require('../server/config/database.cjs');
  connectDB = dbModule.connectDB;
  Project = require('../server/models/Project.cjs');
  Visitor = require('../server/models/Visitor.cjs');
  Contact = require('../server/models/Contact.cjs');
} catch (error) {
  console.error('❌ 모듈 로드 오류:', error.message);
  // Vercel 환경에서 다른 경로 시도
  if (isVercel) {
    try {
      const serverPath = path.join(process.cwd(), 'server');
      const dbModule = require(path.join(serverPath, 'config', 'database.cjs'));
      connectDB = dbModule.connectDB;
      Project = require(path.join(serverPath, 'models', 'Project.cjs'));
      Visitor = require(path.join(serverPath, 'models', 'Visitor.cjs'));
      Contact = require(path.join(serverPath, 'models', 'Contact.cjs'));
    } catch (fallbackError) {
      console.error('❌ 폴백 모듈 로드도 실패:', fallbackError.message);
    }
  }
}

const app = express();

// Vercel 서버리스 환경 감지
const isVercel = process.env.VERCEL === '1';

// 파일 경로 설정
// Vercel: __dirname은 /var/task/api를 가리킴
// 로컬: __dirname은 api/ 디렉토리를 가리킴

// 미들웨어
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'https://hyeyeon-portfolio.vercel.app',
  'https://hyeyeon57-hyeyeon-portfolio-admin.vercel.app',
  process.env.FRONTEND_URL || 'https://hyeyeon-portfolio.vercel.app'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // origin이 없으면 (같은 도메인 요청) 허용
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // 개발 중에는 모든 origin 허용
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// JWT 설정
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'vibe-coding-portfolio-secret-key-2025';
const JWT_COOKIE_NAME = 'admin_token';
const JWT_EXPIRES_IN = '24h'; // 24시간

// 파일 업로드 설정 (Vercel에서는 /tmp 디렉토리 사용)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = '/tmp/projects'; // Vercel의 임시 디렉토리
    if (!existsSync(uploadPath)) {
      mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const originalName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${timestamp}_${originalName}`);
  }
});

const upload = multer({ storage });

// 관리자 계정 정보
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'hing0915';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dpffla525';

// 환경 변수 로깅 (디버깅용)
console.log('🔧 환경 변수 확인:', {
  isVercel: isVercel,
  hasUsernameEnv: !!process.env.ADMIN_USERNAME,
  hasPasswordEnv: !!process.env.ADMIN_PASSWORD,
  usernameFromEnv: process.env.ADMIN_USERNAME || '(기본값 사용)',
  passwordFromEnv: process.env.ADMIN_PASSWORD ? '***설정됨***' : '(기본값 사용)',
  finalUsername: ADMIN_USERNAME,
  finalPasswordLength: ADMIN_PASSWORD.length,
  finalPasswordPreview: ADMIN_PASSWORD.substring(0, 2) + '***' + ADMIN_PASSWORD.substring(ADMIN_PASSWORD.length - 2)
});

// 로그인 체크 미들웨어
// JWT 토큰 검증 미들웨어
const requireAuth = (req, res, next) => {
  const token = req.cookies[JWT_COOKIE_NAME] || req.headers.authorization?.replace('Bearer ', '');
  
  console.log('🔒 인증 체크:', {
    hasToken: !!token,
    tokenPreview: token ? token.substring(0, 20) + '...' : '없음',
    cookies: Object.keys(req.cookies),
    cookieHeader: req.headers.cookie ? '있음' : '없음'
  });
  
  if (!token) {
    console.log('❌ 토큰 없음, 로그인 페이지로 리다이렉트');
    return res.redirect('/admin/login');
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('✅ 토큰 검증 성공:', {
      username: decoded.username,
      exp: new Date(decoded.exp * 1000).toISOString()
    });
    req.user = decoded; // 요청 객체에 사용자 정보 추가
    return next();
  } catch (error) {
    console.log('❌ 토큰 검증 실패:', error.message);
    // 쿠키 삭제
    res.clearCookie(JWT_COOKIE_NAME, {
      httpOnly: true,
      secure: isVercel,
      sameSite: isVercel ? 'none' : 'lax',
      path: '/'
    });
    return res.redirect('/admin/login');
  }
};

// 파일 경로 확인 함수
// Vercel: __dirname은 /var/task/api를 가리키므로 api/admin은 __dirname/admin
// 로컬: __dirname은 api/ 디렉토리를 가리키므로 server/admin은 __dirname/../server/admin
const getAdminFilePath = (filename) => {
  // Vercel 환경: api/admin 디렉토리 (api/index.js와 같은 레벨의 admin 디렉토리)
  if (isVercel) {
    const apiAdminPath = path.join(__dirname, 'admin', filename);
    if (existsSync(apiAdminPath)) {
      return apiAdminPath;
    }
    // 대체 경로 시도
    const altPath = path.join(process.cwd(), 'api', 'admin', filename);
    if (existsSync(altPath)) {
      return altPath;
    }
  } else {
    // 로컬 환경: server/admin 디렉토리
    const serverAdminPath = path.join(__dirname, '..', 'server', 'admin', filename);
    if (existsSync(serverAdminPath)) {
      return serverAdminPath;
    }
    // api/admin도 시도 (개발 중 복사본)
    const apiAdminPath = path.join(__dirname, 'admin', filename);
    if (existsSync(apiAdminPath)) {
      return apiAdminPath;
    }
  }
  
  return null;
};

// 정적 파일 서빙은 각 라우트에서 직접 처리

// 루트 경로 처리
app.get('/', (req, res) => {
  // 루트 경로는 관리자 로그인 페이지로 리다이렉트
  res.redirect('/admin/login');
});

// 백오피스 관리자 페이지 라우트
app.get('/admin/login', (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    return res.redirect('/admin');
  }
  const loginPath = getAdminFilePath('login.html');
  if (loginPath) {
    res.sendFile(loginPath);
  } else {
    console.error('Login page not found. __dirname:', __dirname, 'isVercel:', isVercel);
    res.status(404).send('Login page not found.');
  }
});

app.get('/admin/viewer', (req, res) => {
  const adminIndexPath = getAdminFilePath('index.html');
  if (adminIndexPath) {
    res.sendFile(adminIndexPath);
  } else {
    console.error('Admin viewer page not found. __dirname:', __dirname, 'isVercel:', isVercel);
    res.status(404).send('Admin viewer page not found.');
  }
});

app.get('/admin', requireAuth, (req, res) => {
  console.log('📄 /admin 페이지 요청:', {
    user: req.user?.username,
    hasToken: !!req.cookies[JWT_COOKIE_NAME]
  });
  
  const adminIndexPath = getAdminFilePath('index.html');
  if (adminIndexPath) {
    console.log('✅ Admin 페이지 파일 찾음:', adminIndexPath);
    res.sendFile(adminIndexPath);
  } else {
    console.error('❌ Admin page not found. __dirname:', __dirname, 'isVercel:', isVercel);
    res.status(404).send('Admin page not found.');
  }
});

app.get('/admin/create', requireAuth, (req, res) => {
  const createPath = getAdminFilePath('create.html');
  if (createPath) {
    res.sendFile(createPath);
  } else {
    console.error('Create page not found. __dirname:', __dirname, 'isVercel:', isVercel);
    res.status(404).send('Project creation page not found.');
  }
});

// API Routes
// 인증 API (로컬과 Vercel 모두 지원)
const registerApiRoute = (method, path, handler) => {
  app[method](path, handler);
  app[method](`/api/bo${path.replace('/api', '')}`, handler);
};

registerApiRoute('post', '/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('🔐 로그인 시도:', { 
      username, 
      passwordLength: password?.length,
      expectedUsername: ADMIN_USERNAME,
      expectedPasswordLength: ADMIN_PASSWORD.length,
      isVercel: isVercel
    });
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: '아이디와 비밀번호를 입력해주세요.' 
      });
    }
    
    // 정확한 비교 (공백 제거)
    const trimmedUsername = (username || '').trim();
    const trimmedPassword = (password || '').trim();
    const trimmedExpectedUsername = ADMIN_USERNAME.trim();
    const trimmedExpectedPassword = ADMIN_PASSWORD.trim();
    
    const usernameMatch = trimmedUsername === trimmedExpectedUsername;
    const passwordMatch = trimmedPassword === trimmedExpectedPassword;
    
    console.log('🔍 검증 결과:', { 
      usernameMatch, 
      passwordMatch,
      receivedUsername: trimmedUsername,
      expectedUsername: trimmedExpectedUsername,
      receivedPasswordLength: trimmedPassword.length,
      expectedPasswordLength: trimmedExpectedPassword.length,
      receivedPasswordPreview: trimmedPassword.substring(0, 2) + '***',
      expectedPasswordPreview: trimmedExpectedPassword.substring(0, 2) + '***',
      envPassword: process.env.ADMIN_PASSWORD ? '***설정됨***' : '(기본값)'
    });
    
    if (usernameMatch && passwordMatch) {
      // JWT 토큰 생성
      const token = jwt.sign(
        { 
          username: trimmedUsername,
          authenticated: true 
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      console.log('✅ 로그인 성공:', trimmedUsername);
      console.log('🎫 JWT 토큰 생성 완료');
      
      // 쿠키 옵션 설정
      const cookieOptions = {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24시간
        path: '/',
        secure: isVercel, // Vercel에서는 HTTPS만
        sameSite: isVercel ? 'none' : 'lax' // Vercel에서는 cross-site 허용
      };
      
      // JWT 토큰을 쿠키에 설정
      res.cookie(JWT_COOKIE_NAME, token, cookieOptions);
      
      console.log('🍪 쿠키 설정 완료:', {
        cookieName: JWT_COOKIE_NAME,
        secure: cookieOptions.secure,
        sameSite: cookieOptions.sameSite
      });
      
      res.json({ 
        success: true, 
        message: '로그인 성공',
        token: token // 디버깅용 (실제로는 쿠키에만 저장)
      });
    } else {
      console.warn('⚠️ 로그인 실패:', { 
        receivedUsername: trimmedUsername,
        expectedUsername: trimmedExpectedUsername,
        usernameMatch, 
        passwordMatch,
        receivedPasswordLength: trimmedPassword.length,
        expectedPasswordLength: trimmedExpectedPassword.length
      });
      res.status(401).json({ 
        success: false, 
        error: '아이디 또는 비밀번호가 올바르지 않습니다.' 
      });
    }
  } catch (error) {
    console.error('❌ 로그인 처리 오류:', error);
    res.status(500).json({ 
      success: false, 
      error: '로그인 처리 중 오류가 발생했습니다.' 
    });
  }
});

registerApiRoute('post', '/api/auth/logout', (req, res) => {
  // JWT 쿠키 삭제
  res.clearCookie(JWT_COOKIE_NAME, {
    httpOnly: true,
    secure: isVercel,
    sameSite: isVercel ? 'none' : 'lax',
    path: '/'
  });
  console.log('✅ 로그아웃 완료');
  res.json({ success: true, message: '로그아웃되었습니다.' });
});

registerApiRoute('get', '/api/auth/check', (req, res) => {
  const token = req.cookies[JWT_COOKIE_NAME] || req.headers.authorization?.replace('Bearer ', '');
  let authenticated = false;
  
  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
      authenticated = true;
    } catch (error) {
      authenticated = false;
    }
  }
  
  res.json({
    success: true,
    authenticated: authenticated
  });
});

// MongoDB 연결 초기화
let dbConnected = false;
const initDB = async () => {
  if (!dbConnected) {
    dbConnected = await connectDB();
  }
  return dbConnected;
};

// 방문자 로그 API
registerApiRoute('post', '/api/visitors', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: false, error: 'MongoDB에 연결되지 않았습니다.' });
    }
    const { ip, userAgent, path: visitPath } = req.body;
    const clientIp = ip || req.ip || req.connection.remoteAddress;
    const clientUserAgent = userAgent || req.get('user-agent');
    const clientPath = visitPath || '/';
    const now = new Date();
    const fiveSecondsAgo = new Date(now.getTime() - 5 * 1000);

    const existingVisit = await Visitor.findOne({
      ip: clientIp,
      userAgent: clientUserAgent,
      path: clientPath,
      date: { $gte: fiveSecondsAgo, $lt: now }
    });

    if (existingVisit) {
      await Visitor.updateOne(
        { _id: existingVisit._id },
        { $set: { date: now } }
      );
      return res.json({ success: true, message: '방문자 로그 업데이트 완료 (중복 방지)' });
    }

    await Visitor.create({
      ip: clientIp,
      userAgent: clientUserAgent,
      path: clientPath,
      date: now,
    });

    res.json({ success: true, message: '방문자 로그 저장 완료' });
  } catch (error) {
    console.error('❌ 방문자 로그 저장 오류:', error);
    res.json({ success: false, error: '방문자 로그 저장 실패' });
  }
});

registerApiRoute('get', '/api/visitors/stats', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        success: true,
        today: 0,
        total: 0
      });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayCount = await Visitor.countDocuments({
      date: {
        $gte: today,
        $lt: tomorrow
      }
    });

    const todayCountCreatedAt = await Visitor.countDocuments({
      createdAt: {
        $gte: today,
        $lt: tomorrow
      }
    });

    const finalTodayCount = Math.max(todayCount, todayCountCreatedAt);
    const totalCount = await Visitor.countDocuments();

    res.json({
      success: true,
      today: finalTodayCount,
      total: totalCount
    });
  } catch (error) {
    console.error('❌ 방문자 통계 조회 오류:', error);
    res.json({
      success: true,
      today: 0,
      total: 0
    });
  }
});

registerApiRoute('get', '/api/visitors', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        success: false,
        error: 'MongoDB에 연결되지 않았습니다.'
      });
    }
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const visitors = await Visitor.find()
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const total = await Visitor.countDocuments();

    res.json({
      success: true,
      data: visitors,
      total: total,
      page: page,
      limit: limit
    });
  } catch (error) {
    console.error('❌ 방문자 목록 조회 오류:', error);
    res.status(500).json({ success: false, error: '방문자 목록을 불러오는데 실패했습니다.' });
  }
});

// 프로젝트 목록 조회 (백오피스 API)
const handleGetProjects = async (req, res) => {
  try {
    console.log('📋 프로젝트 목록 조회 요청:', {
      url: req.url,
      method: req.method,
      origin: req.headers.origin
    });
    
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ MongoDB 연결 실패:', mongoose.connection.readyState);
      return res.status(503).json({
        success: false,
        error: 'MongoDB가 연결되지 않았습니다. MongoDB를 실행하거나 .env 파일에 MONGODB_URI를 설정하세요.'
      });
    }
    
    const projects = await Project.find().sort({ createdAt: -1 });
    console.log('✅ 프로젝트 조회 성공:', {
      count: projects.length,
      projectIds: projects.map(p => p.id || p._id)
    });
    
    res.json({ success: true, data: projects });
  } catch (error) {
    console.error('❌ 프로젝트 조회 오류:', error);
    res.status(500).json({ 
      success: false, 
      error: '프로젝트를 불러오는데 실패했습니다.',
      details: error.message 
    });
  }
};

// 프로젝트 목록 조회
registerApiRoute('get', '/api/projects', handleGetProjects);

// 프로젝트 상세 조회
registerApiRoute('get', '/api/projects/:id', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB가 연결되지 않았습니다.'
      });
    }
    let project = await Project.findById(req.params.id);
    if (!project) {
      project = await Project.findOne({ id: req.params.id });
    }
    if (project) {
      res.json({ success: true, data: project });
    } else {
      res.status(404).json({ success: false, error: '프로젝트를 찾을 수 없습니다.' });
    }
  } catch (error) {
    console.error('프로젝트 조회 오류:', error);
    res.status(500).json({ success: false, error: '프로젝트를 불러오는데 실패했습니다.' });
  }
});

// 프로젝트 생성
registerApiRoute('post', '/api/projects', upload.array('images', 9), async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB가 연결되지 않았습니다.'
      });
    }
    const projectData = req.body.project ? JSON.parse(req.body.project) : req.body;
    if (req.files && Array.isArray(req.files)) {
      // Vercel에서는 파일을 클라우드 스토리지에 업로드해야 함
      // 여기서는 경로만 저장 (실제 배포 시 S3 등 사용 권장)
      const imagePaths = req.files.map(file => `/tmp/projects/${file.filename}`);
      projectData.images = imagePaths;
    }
    if (!projectData.id) {
      projectData.id = Date.now().toString();
    }
    const newProject = await Project.create(projectData);
    res.json({ success: true, data: newProject });
  } catch (error) {
    console.error('프로젝트 생성 오류:', error);
    res.status(500).json({ success: false, error: '프로젝트 생성에 실패했습니다.' });
  }
});

// 프로젝트 수정
registerApiRoute('put', '/api/projects/:id', upload.array('images', 9), async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB가 연결되지 않았습니다.'
      });
    }
    let project = await Project.findById(req.params.id);
    if (!project) {
      project = await Project.findOne({ id: req.params.id });
    }
    if (!project) {
      return res.status(404).json({ success: false, error: '프로젝트를 찾을 수 없습니다.' });
    }

    const projectData = req.body.project ? JSON.parse(req.body.project) : req.body;
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const imagePaths = req.files.map(file => `/tmp/projects/${file.filename}`);
      projectData.images = [...(project.images || []), ...imagePaths];
    }
    projectData.id = project.id || req.params.id;

    const updatedProject = await Project.findOneAndUpdate(
      { _id: project._id },
      projectData,
      { new: true, runValidators: true }
    );

    res.json({ success: true, data: updatedProject });
  } catch (error) {
    console.error('프로젝트 수정 오류:', error);
    res.status(500).json({ success: false, error: '프로젝트 수정에 실패했습니다.' });
  }
});

// 프로젝트 삭제
registerApiRoute('delete', '/api/projects/:id', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB가 연결되지 않았습니다.'
      });
    }
    let project = await Project.findById(req.params.id);
    if (!project) {
      project = await Project.findOne({ id: req.params.id });
    }
    if (!project) {
      return res.status(404).json({ success: false, error: '프로젝트를 찾을 수 없습니다.' });
    }

    await Project.findByIdAndDelete(project._id);
    res.json({ success: true, message: '프로젝트가 삭제되었습니다.' });
  } catch (error) {
    console.error('프로젝트 삭제 오류:', error);
    res.status(500).json({ success: false, error: '프로젝트 삭제에 실패했습니다.' });
  }
});

// 연락처 API
registerApiRoute('post', '/api/contacts', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: false, error: 'MongoDB에 연결되지 않았습니다.' });
    }
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: '이름, 이메일, 메시지를 모두 입력해주세요.' });
    }
    const newContact = await Contact.create({ name, email, message });
    res.json({ success: true, data: newContact });
  } catch (error) {
    console.error('연락처 저장 오류:', error);
    res.status(500).json({ success: false, error: '연락처 저장에 실패했습니다.' });
  }
});

registerApiRoute('get', '/api/contacts', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: false, error: 'MongoDB에 연결되지 않았습니다.' });
    }
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json({ success: true, data: contacts });
  } catch (error) {
    console.error('연락처 목록 조회 오류:', error);
    res.status(500).json({ success: false, error: '연락처 목록을 불러오는데 실패했습니다.' });
  }
});

registerApiRoute('put', '/api/contacts/:id/read', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: false, error: 'MongoDB에 연결되지 않았습니다.' });
    }
    const contact = await Contact.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
    if (!contact) {
      return res.status(404).json({ success: false, error: '연락처를 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: contact });
  } catch (error) {
    console.error('연락처 읽음 처리 오류:', error);
    res.status(500).json({ success: false, error: '연락처 읽음 처리에 실패했습니다.' });
  }
});

registerApiRoute('delete', '/api/contacts/:id', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: false, error: 'MongoDB에 연결되지 않았습니다.' });
    }
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) {
      return res.status(404).json({ success: false, error: '연락처를 찾을 수 없습니다.' });
    }
    res.json({ success: true, message: '연락처가 삭제되었습니다.' });
  } catch (error) {
    console.error('연락처 삭제 오류:', error);
    res.status(500).json({ success: false, error: '연락처 삭제에 실패했습니다.' });
  }
});

// 마이그레이션 핸들러 함수
const migrateProjectsHandler = async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB가 연결되지 않았습니다.'
      });
    }

    // 정적 프로젝트 데이터 (portfolio.ts에서 추출)
    const staticProjects = [
      {
        id: '1',
        title: '화해 앱 리뉴얼 제안서',
        subtitle: '화장품 추천 및 리뷰 플랫폼 리뉴얼',
        description: '사용자 피드백 분석을 통한 화해 앱의 사용성 개선 및 새로운 기능 제안',
        fullDescription: '화해 앱의 기존 사용자 피드백을 분석하고, 사용성 문제점을 파악하여 리뉴얼 방향을 제시했습니다. 화장품 추천 알고리즘 개선과 리뷰 시스템 최적화에 중점을 두었습니다.',
        image: '/projects/Hwahae.png',
        tags: ['리뉴얼', '사용성 개선', '추천 시스템'],
        category: 'renewal',
        date: '2024',
        role: 'UX 기획자',
        duration: '2개월',
        team: '3명',
        achievements: ['사용자 피드백 분석 완료', '추천 알고리즘 개선안 제시', '리뷰 시스템 UX 개선'],
        link: '#',
        featured: false
      },
      {
        id: '2',
        title: '맘으로',
        subtitle: '육아정책 통합 앱 신규 기획',
        description: '복잡한 육아정책 정보를 쉽게 찾을 수 있는 통합 플랫폼 설계',
        fullDescription: '산모와 영유아 부모를 위한 육아정책 통합 앱을 기획했습니다. 복잡한 정책 정보를 사용자 중심으로 재구성하여 접근성을 크게 향상시켰습니다.',
        image: '/projects/mom.jpg',
        tags: ['신규 기획', '정책 정보', '사용자 중심 설계'],
        category: 'app',
        date: '2024',
        role: 'UX 기획자',
        duration: '3개월',
        team: '4명',
        achievements: ['정책 정보 접근성 향상', '사용자 탐색 효율 개선', '맞춤형 추천 시스템 설계'],
        link: '#',
        featured: false
      },
      {
        id: '3',
        title: 'SRT 승차권 예매 편의성 개선',
        subtitle: '예매 프로세스 최적화 프로젝트',
        description: 'IA 설계 및 화면 설계서 작성으로 예매 단계를 7단계에서 4단계로 축소',
        fullDescription: 'SRT 예매 시스템의 복잡한 프로세스를 분석하고 재설계했습니다. IA 설계와 UX 플로우 재구성을 통해 예매 단계를 축소하고 접근성 및 사용성을 개선했습니다.',
        image: '/projects/srt.jpg',
        tags: ['IA 설계', '화면설계서', 'UX 플로우'],
        category: 'renewal',
        date: '2024',
        role: 'UX 기획자',
        duration: '3개월',
        team: '3명',
        achievements: ['예매 단계 7→4단계 축소', '접근성 및 사용성 개선', '화면설계서 작성 및 개발 전달'],
        link: '#',
        featured: true
      },
      {
        id: '4',
        title: '밀리의 서재 사용성 개선',
        subtitle: '사용자 중심 UX 리서치 및 개선 프로젝트',
        description: '사용자 인터뷰와 아이트래킹 분석을 통해 책장 관리 성공률을 60%에서 96%로 향상',
        fullDescription: '밀리의 서재 앱의 사용성 문제를 발견하고 개선했습니다. 사용자 인터뷰와 아이트래킹 분석을 통해 핵심 문제를 정의하고, UI 개선 제안으로 책장 관리 성공률을 크게 향상시켰습니다.',
        image: '/projects/millie.jpg',
        tags: ['사용자 인터뷰', '아이트래킹', 'UI 개선'],
        category: 'usability',
        date: '2024',
        role: 'UX 리서처',
        duration: '2개월',
        team: '2명',
        achievements: ['책장 관리 성공률 60% → 96% 향상', '아이트래킹 데이터 기반 인사이트 도출', 'UI 개선안 제시 및 검증'],
        link: '#',
        featured: true
      },
      {
        id: '5',
        title: '계원예술대학교 웹사이트 리뉴얼',
        subtitle: '대학 웹사이트 사용성 개선 프로젝트',
        description: '대학 웹사이트의 정보 구조 개선 및 사용자 경험 최적화',
        fullDescription: '계원예술대학교 웹사이트의 사용성 문제를 분석하고 리뉴얼 방향을 제시했습니다. 정보 구조 개선과 사용자 중심의 네비게이션 설계에 중점을 두었습니다.',
        image: '/projects/kaywon.png',
        tags: ['웹사이트 리뉴얼', '정보 구조', '사용성 개선'],
        category: 'new',
        date: '2024',
        role: 'UX 기획자',
        duration: '2개월',
        team: '3명',
        achievements: ['정보 구조 개선안 제시', '사용자 네비게이션 최적화', '웹사이트 사용성 향상'],
        link: '#',
        featured: true
      },
      {
        id: '6',
        title: 'ART-LANG',
        subtitle: '신진 작가와 아트슈머를 잇는 온라인 전시 플랫폼',
        description: 'IA 설계, UX 구조 기획, 감정 기반 피드 디자인을 통해 전시 참여 프로세스를 획기적으로 개선',
        fullDescription: '신진 작가와 아트슈머를 연결하는 온라인 전시 플랫폼 ArtLang의 사용자 경험을 설계했습니다. 복잡했던 전시 참여 프로세스를 3단계에서 1단계로 단축하여 사용자 참여율을 크게 향상시켰습니다.',
        image: '/projects/artrang.jpg',
        tags: ['IA 설계', 'UX 기획', '감정 기반 디자인'],
        category: 'app',
        date: '2024',
        role: 'UX 기획자',
        duration: '3개월',
        team: '4명',
        achievements: ['전시 참여 프로세스 3단계 → 1단계 단축', '사용자 참여율 향상', '감정 기반 피드 시스템 설계'],
        link: '#',
        featured: true
      },
      {
        id: '7',
        title: '쿠팡 리뉴얼 프로젝트',
        subtitle: '이커머스 플랫폼 사용성 개선',
        description: '쿠팡 앱의 구매 프로세스 최적화 및 사용자 경험 개선 제안',
        fullDescription: '쿠팡 앱의 구매 프로세스를 분석하고 사용성 개선 방안을 제시했습니다. 복잡한 구매 단계를 단순화하고 사용자 만족도를 향상시키는 방향으로 기획했습니다.',
        image: '/projects/cupang.png',
        tags: ['이커머스', '구매 프로세스', '사용성 개선'],
        category: 'renewal',
        date: '2024',
        role: 'UX 기획자',
        duration: '2개월',
        team: '3명',
        achievements: ['구매 프로세스 단순화', '사용자 만족도 향상', '구매 전환율 개선'],
        link: '#',
        featured: false
      },
      {
        id: '8',
        title: '데이터 시각화 프로젝트',
        subtitle: 'Data Storytelling & 대시보드 UX',
        description: '복잡한 데이터를 사용자가 직관적으로 이해할 수 있는 대시보드 및 인터랙티브 시각화 설계',
        fullDescription: '복잡한 데이터를 사용자가 직관적으로 이해할 수 있는 대시보드와 인터랙티브 시각화를 기획했습니다. 데이터의 흐름과 관계를 쉽게 파악할 수 있도록 시각적 인사이트를 제공하는 시스템을 설계했습니다.',
        image: '/projects/data.jpg',
        tags: ['Data Storytelling', '대시보드 UX', '시각적 인사이트'],
        category: 'proposal',
        date: '2024',
        role: '데이터 분석 기획',
        duration: '3개월',
        team: '4명',
        achievements: ['데이터 맵 설계 완료', '시각화 IA 구조 설계', '대시보드 와이어프레임 제작'],
        link: '#',
        featured: false
      },
      {
        id: '9',
        title: 'Portfolio Website',
        subtitle: 'Cursor AI × Figma MCP 연동 제작',
        description: '기획자의 시선으로 디자인부터 코드까지 직접 설계하며, AI를 활용한 사고 확장과 문서화 중심의 제작 프로세스 구축',
        fullDescription: '기획자로서 AI를 활용해 포트폴리오 웹사이트를 직접 기획하고 제작했습니다. Cursor AI와 Figma MCP를 연동하여 디자인 시스템부터 코드까지 일관성 있게 구현했습니다.',
        image: '/projects/port.jpg',
        tags: ['AI 활용', 'Cursor', 'Figma MCP', '웹 기획'],
        category: 'web',
        date: '2025',
        role: '기획자 & 개발자',
        duration: '1개월',
        team: '1명',
        achievements: ['AI를 활용한 효율적 기획 프로세스', 'Figma 디자인 시스템 완벽 구현', '문서화 중심의 체계적 제작'],
        link: '#',
        featured: false
      }
    ];

    console.log(`📦 ${staticProjects.length}개의 프로젝트를 MongoDB로 마이그레이션합니다...`);

    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const projectData of staticProjects) {
      try {
        const existing = await Project.findOne({ id: projectData.id });
        
        if (existing) {
          await Project.findOneAndUpdate(
            { id: projectData.id },
            projectData,
            { new: true, runValidators: true }
          );
          console.log(`🔄 프로젝트 "${projectData.title}" (ID: ${projectData.id}) 업데이트됨`);
          updated++;
        } else {
          await Project.create(projectData);
          console.log(`✅ 프로젝트 "${projectData.title}" (ID: ${projectData.id}) 추가됨`);
          added++;
        }
      } catch (error) {
        console.error(`❌ 프로젝트 "${projectData.title}" (ID: ${projectData.id}) 처리 실패:`, error.message);
        skipped++;
      }
    }

    res.json({
      success: true,
      message: '마이그레이션 완료',
      added,
      updated,
      skipped,
      total: staticProjects.length
    });
  } catch (error) {
    console.error('❌ 마이그레이션 오류:', error);
    res.status(500).json({
      success: false,
      error: '마이그레이션 중 오류가 발생했습니다.',
      details: error.message
    });
  }
};

// 마이그레이션 API 등록 (인증 필요)
app.post('/api/migrate/projects', requireAuth, migrateProjectsHandler);
app.post('/api/bo/migrate/projects', requireAuth, migrateProjectsHandler);

// Vercel 서버리스 함수 핸들러
// Vercel 환경에서는 서버리스 함수로, 로컬에서는 Express 앱으로 동작
if (isVercel) {
  // Vercel 서버리스 함수 형식
  module.exports = (req, res) => {
    try {
      // CORS 헤더 추가
      const origin = req.headers.origin;
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }
      
      // Vercel에서 rewrite된 경로 처리
      // req.url은 원본 경로를 포함 (예: /admin, /admin/login, /api/bo/auth/login)
      // /api/bo/* 경로는 그대로 유지 (registerApiRoute가 이미 /api/bo 경로도 등록함)
      console.log('🌐 서버리스 함수 요청:', {
        method: req.method,
        url: req.url,
        originalUrl: req.originalUrl,
        path: req.path
      });
      
      // 루트 경로 직접 처리
      if (req.url === '/' || req.path === '/') {
        return res.redirect('/admin/login');
      }
      
      // Express 앱에 요청 전달
      return app(req, res);
    } catch (error) {
      console.error('❌ 서버리스 함수 오류:', error);
      res.status(500).json({ 
        success: false, 
        error: '서버 오류가 발생했습니다.' 
      });
    }
  };
} else {
  // 로컬 개발 환경
  module.exports = app;
}

