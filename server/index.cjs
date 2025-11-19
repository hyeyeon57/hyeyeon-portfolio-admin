require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { existsSync, mkdirSync, readFileSync } = require('fs');
const multer = require('multer');
const mongoose = require('mongoose');
const session = require('express-session');
const { connectDB } = require('./config/database.cjs');
const Project = require('./models/Project.cjs');
const Visitor = require('./models/Visitor.cjs');
const Contact = require('./models/Contact.cjs');

const app = express();
const PORT = 3005;
// __dirname은 CommonJS에서 자동으로 제공됨

// 미들웨어
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// 정적 파일 서빙은 라우트 이후로 이동 (라우트가 우선순위를 가짐)

// 세션 설정
app.use(session({
  secret: process.env.SESSION_SECRET || 'vibe-coding-portfolio-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // HTTPS에서는 true로 설정
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24시간
  }
}));

// 파일 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'public', 'projects');
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

// 관리자 계정 정보 (환경 변수 또는 기본값)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'hing0915';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dpffla525!';

// 로그인 체크 미들웨어
const requireAuth = (req, res, next) => {
  if (req.session && req.session.isAuthenticated) {
    return next();
  }
  res.redirect('/admin/login');
};

// 백오피스 관리자 페이지 라우트 (API 라우트보다 먼저 정의)
app.get('/admin/login', (req, res) => {
  console.log('✅ /admin/login GET 요청 받음!');
  console.log('요청 URL:', req.url);
  console.log('요청 경로:', req.path);
  
  // 이미 로그인되어 있으면 관리자 페이지로 리다이렉트
  if (req.session && req.session.isAuthenticated) {
    console.log('이미 로그인됨, /admin으로 리다이렉트');
    return res.redirect('/admin');
  }
  
  const loginPath = path.resolve(__dirname, 'admin', 'login.html');
  console.log('로그인 페이지 경로:', loginPath);
  console.log('파일 존재 여부:', require('fs').existsSync(loginPath));
  
  res.sendFile(loginPath, (err) => {
    if (err) {
      console.error('❌ 로그인 페이지 로드 오류:', err);
      console.error('경로:', loginPath);
      res.status(500).send('로그인 페이지를 불러올 수 없습니다.');
    } else {
      console.log('✅ 로그인 페이지 전송 성공');
    }
  });
});

// 비로그인 사용자를 위한 읽기 전용 관리자 화면 (더 구체적인 경로를 먼저 정의)
app.get('/admin/viewer', (req, res) => {
  console.log('✅ /admin/viewer GET 요청 받음!');
  console.log('요청 URL:', req.url);
  console.log('요청 경로:', req.path);
  
  const adminPath = path.resolve(__dirname, 'admin', 'index.html');
  console.log('관리자 페이지 경로:', adminPath);
  console.log('파일 존재 여부:', require('fs').existsSync(adminPath));
  
  res.sendFile(adminPath, (err) => {
    if (err) {
      console.error('❌ 관리자 페이지 로드 오류:', err);
      console.error('경로:', adminPath);
      res.status(500).send('관리자 페이지를 불러올 수 없습니다.');
    } else {
      console.log('✅ 관리자 페이지 전송 성공');
    }
  });
});

app.get('/admin', requireAuth, (req, res) => {
  // 로그인한 사용자만 접근 가능 (Viewer Access)
  const adminPath = path.resolve(__dirname, 'admin', 'index.html');
  res.sendFile(adminPath, (err) => {
    if (err) {
      console.error('관리자 페이지 로드 오류:', err);
      res.status(500).send('관리자 페이지를 불러올 수 없습니다.');
    }
  });
});

app.get('/admin/create', requireAuth, (req, res) => {
  const createPath = path.resolve(__dirname, 'admin', 'create.html');
  res.sendFile(createPath, (err) => {
    if (err) {
      console.error('프로젝트 생성 페이지 로드 오류:', err);
      res.status(500).send('프로젝트 생성 페이지를 불러올 수 없습니다.');
    }
  });
});

// API Routes

// 인증 API
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.isAuthenticated = true;
    req.session.username = username;
    res.json({ success: true, message: '로그인 성공' });
  } else {
    res.status(401).json({ success: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: '로그아웃 실패' });
    }
    res.json({ success: true, message: '로그아웃 성공' });
  });
});

app.get('/api/auth/check', (req, res) => {
  res.json({ 
    success: true, 
    authenticated: req.session && req.session.isAuthenticated || false 
  });
});

// 방문자 로그 API
app.post('/api/visitors', async (req, res) => {
  try {
    // MongoDB 연결 확인
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: false, error: 'MongoDB에 연결되지 않았습니다.' });
    }
    
    const { ip, userAgent, path } = req.body;
    const clientIp = ip || req.ip || req.connection.remoteAddress;
    const clientUserAgent = userAgent || req.get('user-agent');
    const clientPath = path || '/';
    const now = new Date();
    
    // 5초 이내 같은 IP, UserAgent, Path의 중복 로그 방지
    const fiveSecondsAgo = new Date(now.getTime() - 5000);
    const existingVisit = await Visitor.findOne({
      ip: clientIp,
      userAgent: clientUserAgent,
      path: clientPath,
      $or: [
        { date: { $gte: fiveSecondsAgo } },
        { createdAt: { $gte: fiveSecondsAgo } }
      ]
    });
    
    if (existingVisit) {
      // 중복 요청이면 기존 로그 업데이트만 (카운트 증가 방지)
      return res.json({ success: true, message: '중복 방문 로그 (무시됨)' });
    }
    
    // 방문자 로그 저장
    await Visitor.create({
      ip: clientIp,
      userAgent: clientUserAgent,
      path: clientPath,
      date: now,
    });
    
    res.json({ success: true, message: '방문자 로그 저장 완료' });
  } catch (error) {
    console.error('방문자 로그 저장 오류:', error);
    res.json({ success: false, error: '방문자 로그 저장 실패' });
  }
});

// 일일 방문자 수 조회 API
app.get('/api/visitors/stats', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️  MongoDB 연결되지 않음, 방문자 통계 0 반환');
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
    
    // 오늘 방문자 수 (date 필드 기준)
    const todayCount = await Visitor.countDocuments({
      date: {
        $gte: today,
        $lt: tomorrow
      }
    });
    
    // createdAt 필드로도 확인 (백업)
    const todayCountByCreated = await Visitor.countDocuments({
      createdAt: {
        $gte: today,
        $lt: tomorrow
      }
    });
    
    // 더 큰 값을 사용
    const finalTodayCount = Math.max(todayCount, todayCountByCreated);
    
    // 전체 방문자 수
    const totalCount = await Visitor.countDocuments();
    
    console.log(`📊 방문자 통계: 오늘 ${finalTodayCount}명, 전체 ${totalCount}명`);
    
    res.json({ 
      success: true, 
      today: finalTodayCount,
      total: totalCount
    });
  } catch (error) {
    console.error('방문자 통계 조회 오류:', error);
    res.json({ 
      success: true, 
      today: 0, 
      total: 0 
    });
  }
});

// 방문자 목록 조회 API
app.get('/api/visitors', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ 
        success: false, 
        error: 'MongoDB에 연결되지 않았습니다.' 
      });
    }
    
    const limit = parseInt(req.query.limit) || 50; // 기본 50개
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    
    // 방문자 목록 조회 (최신순)
    const visitors = await Visitor.find()
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    
    // 전체 방문자 수
    const total = await Visitor.countDocuments();
    
    res.json({ 
      success: true, 
      data: visitors,
      total: total,
      page: page,
      limit: limit
    });
  } catch (error) {
    console.error('방문자 목록 조회 오류:', error);
    res.json({ 
      success: false, 
      error: '방문자 목록을 불러오는데 실패했습니다.' 
    });
  }
});

// 프로젝트 목록 조회
app.get('/api/projects', async (req, res) => {
  try {
    // MongoDB 연결 확인
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB가 연결되지 않았습니다. MongoDB를 실행하거나 .env 파일에 MONGODB_URI를 설정하세요.' 
      });
    }
    
    const projects = await Project.find().sort({ createdAt: -1 });
    res.json({ success: true, data: projects });
  } catch (error) {
    console.error('프로젝트 조회 오류:', error);
    res.status(500).json({ success: false, error: '프로젝트를 불러오는데 실패했습니다.' });
  }
});

// 프로젝트 상세 조회 (MongoDB _id 또는 id로 조회)
app.get('/api/projects/:id', async (req, res) => {
  try {
    // MongoDB 연결 확인
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB가 연결되지 않았습니다. MongoDB를 실행하거나 .env 파일에 MONGODB_URI를 설정하세요.' 
      });
    }
    
    // MongoDB _id로 먼저 시도
    let project = await Project.findById(req.params.id);
    
    // _id로 찾지 못하면 id 필드로 검색
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
app.post('/api/projects', upload.array('images', 9), async (req, res) => {
  try {
    // MongoDB 연결 확인
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB가 연결되지 않았습니다. MongoDB를 실행하거나 .env 파일에 MONGODB_URI를 설정하세요.' 
      });
    }
    
    const projectData = req.body.project ? JSON.parse(req.body.project) : req.body;
    
    // 업로드된 이미지 경로 추가
    if (req.files && Array.isArray(req.files)) {
      const imagePaths = req.files.map(file => `/projects/${file.filename}`);
      projectData.images = imagePaths;
    }

    // id가 없으면 생성
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

// 프로젝트 수정 (MongoDB _id 또는 id로 수정)
app.put('/api/projects/:id', upload.array('images', 9), async (req, res) => {
  try {
    // MongoDB 연결 확인
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB가 연결되지 않았습니다. MongoDB를 실행하거나 .env 파일에 MONGODB_URI를 설정하세요.' 
      });
    }
    
    // MongoDB _id로 먼저 시도
    let project = await Project.findById(req.params.id);
    
    // _id로 찾지 못하면 id 필드로 검색
    if (!project) {
      project = await Project.findOne({ id: req.params.id });
    }
    
    if (!project) {
      return res.status(404).json({ success: false, error: '프로젝트를 찾을 수 없습니다.' });
    }

    const projectData = req.body.project ? JSON.parse(req.body.project) : req.body;
    
    // 업로드된 이미지 경로 추가
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const imagePaths = req.files.map(file => `/projects/${file.filename}`);
      projectData.images = [...(project.images || []), ...imagePaths];
    }

    // id는 변경하지 않음
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

// 프로젝트 삭제 (MongoDB _id 또는 id로 삭제)
app.delete('/api/projects/:id', async (req, res) => {
  try {
    // MongoDB 연결 확인
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB가 연결되지 않았습니다. MongoDB를 실행하거나 .env 파일에 MONGODB_URI를 설정하세요.' 
      });
    }
    
    // MongoDB _id로 먼저 시도
    let project = await Project.findById(req.params.id);
    
    // _id로 찾지 못하면 id 필드로 검색
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
    res.status(500).json({ success: false, error: '프로젝트 삭제에 실패했습니다.'     });
  }
});

// 연락 관리 API
// 연락 생성 (FO에서 호출)
app.post('/api/contacts', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ 
        success: false, 
        error: 'MongoDB에 연결되지 않았습니다.' 
      });
    }
    
    const { name, email, message, read } = req.body;
    
    const contact = await Contact.create({
      name,
      email,
      message,
      read: read || false,
    });
    
    res.json({ success: true, data: contact });
  } catch (error) {
    console.error('연락 생성 오류:', error);
    res.status(500).json({ success: false, error: '연락 저장에 실패했습니다.' });
  }
});

// 연락 목록 조회
app.get('/api/contacts', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ 
        success: false, 
        error: 'MongoDB에 연결되지 않았습니다.' 
      });
    }
    
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    
    const contacts = await Contact.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    
    const total = await Contact.countDocuments();
    
    res.json({ 
      success: true, 
      data: contacts,
      total: total,
      page: page,
      limit: limit
    });
  } catch (error) {
    console.error('연락 목록 조회 오류:', error);
    res.json({ 
      success: false, 
      error: '연락 목록을 불러오는데 실패했습니다.' 
    });
  }
});

// 연락 읽음 처리
app.put('/api/contacts/:id/read', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ 
        success: false, 
        error: 'MongoDB에 연결되지 않았습니다.' 
      });
    }
    
    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    );
    
    if (!contact) {
      return res.status(404).json({ success: false, error: '연락을 찾을 수 없습니다.' });
    }
    
    res.json({ success: true, data: contact });
  } catch (error) {
    console.error('연락 읽음 처리 오류:', error);
    res.status(500).json({ success: false, error: '읽음 처리에 실패했습니다.' });
  }
});

// 연락 삭제
app.delete('/api/contacts/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ 
        success: false, 
        error: 'MongoDB에 연결되지 않았습니다.' 
      });
    }
    
    const contact = await Contact.findByIdAndDelete(req.params.id);
    
    if (!contact) {
      return res.status(404).json({ success: false, error: '연락을 찾을 수 없습니다.' });
    }
    
    res.json({ success: true, message: '연락이 삭제되었습니다.' });
  } catch (error) {
    console.error('연락 삭제 오류:', error);
    res.status(500).json({ success: false, error: '삭제에 실패했습니다.' });
  }
});

// 프로젝트 파일 다운로드 API
app.get('/api/projects/:id/files', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB에 연결되지 않았습니다.' 
      });
    }
    
    // MongoDB _id로 먼저 시도
    let project = await Project.findById(req.params.id);
    
    // _id로 찾지 못하면 id 필드로 검색
    if (!project) {
      project = await Project.findOne({ id: req.params.id });
    }
    
    if (!project) {
      return res.status(404).json({ success: false, error: '프로젝트를 찾을 수 없습니다.' });
    }
    
    // 프로젝트의 이미지 파일 목록 반환
    const files = [];
    
    // image 필드가 있으면 추가
    if (project.image) {
      files.push({
        name: project.image.split('/').pop() || 'image.jpg',
        path: project.image,
        url: `http://localhost:${PORT}${project.image.startsWith('/') ? project.image : '/' + project.image}`
      });
    }
    
    // images 배열이 있으면 추가
    if (project.images && Array.isArray(project.images)) {
      project.images.forEach(img => {
        if (img && !files.find(f => f.path === img)) {
          files.push({
            name: img.split('/').pop() || 'image.jpg',
            path: img,
            url: `http://localhost:${PORT}${img.startsWith('/') ? img : '/' + img}`
          });
        }
      });
    }
    
    res.json({ success: true, data: files });
  } catch (error) {
    console.error('파일 목록 조회 오류:', error);
    res.status(500).json({ success: false, error: '파일 목록을 불러오는데 실패했습니다.' });
  }
});

// 프로젝트 파일 다운로드
app.get('/api/projects/:id/files/:filename', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB에 연결되지 않았습니다.' 
      });
    }
    
    // MongoDB _id로 먼저 시도
    let project = await Project.findById(req.params.id);
    
    // _id로 찾지 못하면 id 필드로 검색
    if (!project) {
      project = await Project.findOne({ id: req.params.id });
    }
    
    if (!project) {
      return res.status(404).json({ success: false, error: '프로젝트를 찾을 수 없습니다.' });
    }
    
    const filename = req.params.filename;
    let filePath = null;
    
    // image 필드 확인
    if (project.image && project.image.includes(filename)) {
      filePath = path.join(__dirname, 'public', project.image.replace(/^\//, ''));
    }
    
    // images 배열 확인
    if (!filePath && project.images && Array.isArray(project.images)) {
      const matchedImage = project.images.find(img => img && img.includes(filename));
      if (matchedImage) {
        filePath = path.join(__dirname, 'public', matchedImage.replace(/^\//, ''));
      }
    }
    
    // FO 프로젝트 이미지 경로도 확인
    if (!filePath) {
      const foImagePath = path.join(__dirname, '..', 'public', 'projects', filename);
      if (existsSync(foImagePath)) {
        filePath = foImagePath;
      }
    }
    
    if (!filePath || !existsSync(filePath)) {
      return res.status(404).json({ success: false, error: '파일을 찾을 수 없습니다.' });
    }
    
    // 파일 다운로드
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('파일 다운로드 오류:', err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: '파일 다운로드에 실패했습니다.' });
        }
      }
    });
  } catch (error) {
    console.error('파일 다운로드 오류:', error);
    res.status(500).json({ success: false, error: '파일 다운로드에 실패했습니다.' });
  }
});

// 정적 파일 서빙 (모든 라우트 이후)
app.use(express.static(path.join(__dirname, 'public')));

// 서버 시작
const startServer = async () => {
  try {
    // MongoDB 연결 (실패해도 서버는 계속 실행)
    const dbConnected = await connectDB();
    
    if (!dbConnected) {
      console.log('⚠️  MongoDB 연결 없이 서버를 시작합니다.');
      console.log('⚠️  프로젝트 관리 기능은 사용할 수 없습니다.');
    }
    
    // 서버 시작
    app.listen(PORT, () => {
      console.log(`============================================`);
      console.log(`  백오피스 서버 시작`);
      console.log(`  포트: ${PORT}`);
      console.log(`  주소: http://localhost:${PORT}`);
      console.log(`  관리자: http://localhost:${PORT}/admin`);
      if (!dbConnected) {
        console.log(`  ⚠️  MongoDB 연결 필요`);
      }
      console.log(`============================================`);
    });
  } catch (error) {
    console.error('❌ 서버 시작 실패:', error);
    process.exit(1);
  }
};

startServer();

