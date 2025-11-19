require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('./config/database.cjs');
const Project = require('./models/Project.cjs');
const { readFileSync } = require('fs');
const path = require('path');

const migrateProjects = async () => {
  try {
    await connectDB();
    
    // 기존 프로젝트 데이터 로드
    const projectsFile = path.join(__dirname, '../data/projects.json');
    const projectsData = JSON.parse(readFileSync(projectsFile, 'utf-8'));
    
    console.log(`📦 ${projectsData.length}개의 프로젝트를 마이그레이션합니다...`);
    
    // 기존 데이터 삭제 (선택사항)
    const existingCount = await Project.countDocuments();
    if (existingCount > 0) {
      console.log(`⚠️  기존 ${existingCount}개의 프로젝트가 있습니다.`);
      console.log('기존 데이터를 유지하고 새 데이터를 추가합니다.');
    }
    
    // 프로젝트 추가
    let added = 0;
    let skipped = 0;
    
    for (const projectData of projectsData) {
      const existing = await Project.findOne({ id: projectData.id });
      if (existing) {
        console.log(`⏭️  프로젝트 "${projectData.title}" (ID: ${projectData.id})는 이미 존재합니다. 건너뜁니다.`);
        skipped++;
        continue;
      }
      
      await Project.create(projectData);
      console.log(`✅ 프로젝트 "${projectData.title}" 추가됨`);
      added++;
    }
    
    console.log(`\n✨ 마이그레이션 완료!`);
    console.log(`   추가: ${added}개`);
    console.log(`   건너뜀: ${skipped}개`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ 마이그레이션 오류:', error);
    process.exit(1);
  }
};

migrateProjects();

