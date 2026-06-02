"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const prisma = new client_1.PrismaClient();
const ROOT_CATEGORIES = [
    { rootType: client_1.RootType.PAST_PAPERS, name: 'Past Papers', slug: 'past-papers' },
    { rootType: client_1.RootType.MODEL_PAPERS, name: 'Model Papers', slug: 'model-papers' },
    {
        rootType: client_1.RootType.TERM_TEST,
        name: 'Term Test Papers',
        slug: 'term-test-papers',
    },
    { rootType: client_1.RootType.SYLLABUS, name: 'School Syllabus', slug: 'syllabus' },
    {
        rootType: client_1.RootType.TEACHERS_GUIDE,
        name: "Teacher's Guides",
        slug: 'teacher-guides',
    },
    { rootType: client_1.RootType.TEXT_BOOKS, name: 'Text Books', slug: 'text-books' },
    { rootType: client_1.RootType.GAZETTE, name: 'Government Gazette', slug: 'gazette' },
];
async function main() {
    const storageRoot = process.env.STORAGE_ROOT || './storage/uploads';
    fs.mkdirSync(storageRoot, { recursive: true });
    for (const root of ROOT_CATEGORIES) {
        await prisma.category.upsert({
            where: {
                slug_rootType: { slug: root.slug, rootType: root.rootType },
            },
            create: root,
            update: { name: root.name },
        });
    }
    const facets = [
        { facetKey: client_1.FacetKey.EXAM, label: 'G.C.E. Ordinary Level', slug: 'gce-ordinary-level' },
        { facetKey: client_1.FacetKey.EXAM, label: 'G.C.E. Advance Level', slug: 'gce-advance-level' },
        { facetKey: client_1.FacetKey.EXAM, label: 'Grade 5 Scholarship', slug: 'grade-5-scholarship' },
        { facetKey: client_1.FacetKey.GRADE, label: 'Grade 6', slug: 'grade-6' },
        { facetKey: client_1.FacetKey.GRADE, label: 'Grade 10', slug: 'grade-10' },
        { facetKey: client_1.FacetKey.SUBJECT, label: 'Mathematics', slug: 'mathematics' },
        { facetKey: client_1.FacetKey.SUBJECT, label: 'History', slug: 'history' },
        { facetKey: client_1.FacetKey.SUBJECT, label: 'Science', slug: 'science' },
        { facetKey: client_1.FacetKey.YEAR, label: '2024', slug: '2024' },
        { facetKey: client_1.FacetKey.YEAR, label: '2023', slug: '2023' },
        { facetKey: client_1.FacetKey.YEAR, label: '2022', slug: '2022' },
        { facetKey: client_1.FacetKey.MEDIUM, label: 'Sinhala', slug: 'sinhala' },
        { facetKey: client_1.FacetKey.MEDIUM, label: 'Tamil', slug: 'tamil' },
        { facetKey: client_1.FacetKey.MEDIUM, label: 'English', slug: 'english' },
        { facetKey: client_1.FacetKey.TERM, label: '1st Term', slug: '1st-term' },
        { facetKey: client_1.FacetKey.TERM, label: '2nd Term', slug: '2nd-term' },
        { facetKey: client_1.FacetKey.TERM, label: '3rd Term', slug: '3rd-term' },
        {
            facetKey: client_1.FacetKey.PROVINCE,
            label: 'Western Province',
            slug: 'western-province',
        },
    ];
    for (const f of facets) {
        await prisma.facetValue.upsert({
            where: { facetKey_slug: { facetKey: f.facetKey, slug: f.slug } },
            create: f,
            update: { label: f.label },
        });
    }
    const pastPapers = await prisma.category.findFirstOrThrow({
        where: { slug: 'past-papers', rootType: client_1.RootType.PAST_PAPERS },
    });
    const olExam = await prisma.category.upsert({
        where: {
            slug_rootType: {
                slug: 'gce-ordinary-level-exam',
                rootType: client_1.RootType.PAST_PAPERS,
            },
        },
        create: {
            parentId: pastPapers.id,
            rootType: client_1.RootType.PAST_PAPERS,
            name: 'G.C.E. Ordinary Level Exam',
            slug: 'gce-ordinary-level-exam',
            sortOrder: 1,
        },
        update: {},
    });
    const facetRecords = await prisma.facetValue.findMany({
        where: {
            slug: {
                in: ['gce-ordinary-level', 'mathematics', '2024', 'sinhala'],
            },
        },
    });
    const samplePdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF';
    const relPath = 'past-papers/sample-gce-ol-maths-2024-sinhala.pdf';
    const fullPath = path.join(storageRoot, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, samplePdf);
    const doc = await prisma.document.upsert({
        where: { slug: 'gce-ol-mathematics-2024-past-paper-sinhala' },
        create: {
            title: 'G.C.E. O/L Mathematics 2024 Past Paper (Sinhala Medium)',
            slug: 'gce-ol-mathematics-2024-past-paper-sinhala',
            description: 'Sample past paper for development.',
            categoryId: olExam.id,
            status: client_1.DocumentStatus.PUBLISHED,
            publishedAt: new Date(),
            facets: {
                create: facetRecords.map((f) => ({ facetValueId: f.id })),
            },
            files: {
                create: {
                    medium: client_1.Medium.SINHALA,
                    relativePath: relPath,
                    fileName: 'gce-ol-maths-2024-sinhala.pdf',
                    sizeBytes: Buffer.byteLength(samplePdf),
                },
            },
        },
        update: {
            status: client_1.DocumentStatus.PUBLISHED,
            publishedAt: new Date(),
        },
    });
    const termTest = await prisma.category.findFirstOrThrow({
        where: { slug: 'term-test-papers', rootType: client_1.RootType.TERM_TEST },
    });
    const grade6 = await prisma.category.upsert({
        where: {
            slug_rootType: { slug: 'grade-6', rootType: client_1.RootType.TERM_TEST },
        },
        create: {
            parentId: termTest.id,
            rootType: client_1.RootType.TERM_TEST,
            name: 'Grade 6',
            slug: 'grade-6',
            sortOrder: 6,
        },
        update: {},
    });
    const termFacets = await prisma.facetValue.findMany({
        where: { slug: { in: ['grade-6', 'history', '2023', '3rd-term', 'sinhala'] } },
    });
    const termRelPath = 'term-test-papers/western-grade6-history-2023-3rd-sinhala.pdf';
    const termFullPath = path.join(storageRoot, termRelPath);
    fs.mkdirSync(path.dirname(termFullPath), { recursive: true });
    fs.writeFileSync(termFullPath, samplePdf);
    await prisma.document.upsert({
        where: { slug: 'western-province-grade-6-history-2023-3rd-term-sinhala' },
        create: {
            title: 'Western Province Grade 6 History 2023 3rd Term Test Paper',
            slug: 'western-province-grade-6-history-2023-3rd-term-sinhala',
            description: 'Sample term test paper.',
            categoryId: grade6.id,
            status: client_1.DocumentStatus.PUBLISHED,
            publishedAt: new Date(),
            facets: {
                create: termFacets.map((f) => ({ facetValueId: f.id })),
            },
            files: {
                create: {
                    medium: client_1.Medium.SINHALA,
                    relativePath: termRelPath,
                    fileName: 'western-grade6-history-2023-3rd-sinhala.pdf',
                    sizeBytes: Buffer.byteLength(samplePdf),
                },
            },
        },
        update: { status: client_1.DocumentStatus.PUBLISHED },
    });
    const adminHash = await bcrypt.hash('examkadeadmin@123', 12);
    await prisma.adminUser.upsert({
        where: { email: 'admin@examkade.com' },
        create: {
            email: 'admin@examkade.com',
            passwordHash: adminHash,
            name: 'Admin',
        },
        update: { passwordHash: adminHash },
    });
    console.log('Seed complete:', { docId: doc.id });
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=seed.js.map