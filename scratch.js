const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.facetValue.findMany({
  where: {
    facetKey: 'SUBJECT',
    label: { contains: 'Art', mode: 'insensitive' }
  }
})
.then(results => {
  console.log('Results:', results);
  results.forEach(r => {
    console.log(`Label: "${r.label}" (length: ${r.label.length}), Slug: "${r.slug}"`);
  });
})
.finally(() => prisma.$disconnect());
