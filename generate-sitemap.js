import { writeFileSync } from 'fs';
import { join } from 'path';

// Your production domain
const BASE_URL = 'https://pipsplit.com';

// Define your public routes here
// Routes behind auth guards are excluded as they're not accessible to crawlers
const publicRoutes = [
  {
    path: '',
    priority: '1.0',
    changefreq: 'weekly',
  },
  {
    path: 'help',
    priority: '0.8',
    changefreq: 'monthly',
  },
  {
    path: 'about',
    priority: '0.8',
    changefreq: 'monthly',
  },
  {
    path: 'split',
    priority: '0.9',
    changefreq: 'weekly',
  },
  {
    path: 'auth/login',
    priority: '0.7',
    changefreq: 'monthly',
  },
  {
    path: 'auth/register',
    priority: '0.7',
    changefreq: 'monthly',
  },
  {
    path: 'auth/forgot-password',
    priority: '0.6',
    changefreq: 'monthly',
  },
  // Demo routes - showcase app features without requiring authentication
  {
    path: 'demo/administration/groups',
    priority: '0.8',
    changefreq: 'weekly',
  },
  {
    path: 'demo/administration/members',
    priority: '0.8',
    changefreq: 'weekly',
  },
  {
    path: 'demo/administration/categories',
    priority: '0.8',
    changefreq: 'weekly',
  },
  {
    path: 'demo/expenses',
    priority: '0.9',
    changefreq: 'weekly',
  },
  {
    path: 'demo/expenses/add',
    priority: '0.8',
    changefreq: 'weekly',
  },
  {
    path: 'demo/memorized',
    priority: '0.8',
    changefreq: 'weekly',
  },
  {
    path: 'demo/analysis/summary',
    priority: '0.9',
    changefreq: 'weekly',
  },
  {
    path: 'demo/analysis/history',
    priority: '0.8',
    changefreq: 'weekly',
  },
  {
    path: 'demo/split',
    priority: '0.8',
    changefreq: 'weekly',
  },
  {
    path: 'demo/help',
    priority: '0.7',
    changefreq: 'monthly',
  },
];

function generateSitemap() {
  const lastmod = new Date().toISOString().split('T')[0];

  const urls = publicRoutes
    .map(
      (route) => `  <url>
    <loc>${BASE_URL}/${route.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`
    )
    .join('\n');

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return sitemap;
}

function generateRobotsTxt() {
  return `# robots.txt for ${BASE_URL}
User-agent: *
Allow: /
# Allow demo routes (public showcase of features)
Allow: /demo/
# Disallow authenticated routes
Disallow: /administration/
Disallow: /expenses/
Disallow: /analysis/
Disallow: /memorized/
Disallow: /auth/account
Disallow: /auth/reset-password
Disallow: /auth/account-action

# Sitemap location
Sitemap: ${BASE_URL}/sitemap.xml
`;
}

// Generate and save files
try {
  const sitemap = generateSitemap();
  const robotsTxt = generateRobotsTxt();

  // Save to dist/browser directory (Angular's output directory)
  const outputDir = join(process.cwd(), 'dist', 'browser');

  writeFileSync(join(outputDir, 'sitemap.xml'), sitemap, 'utf8');
  console.log('✓ sitemap.xml generated successfully');

  writeFileSync(join(outputDir, 'robots.txt'), robotsTxt, 'utf8');
  console.log('✓ robots.txt generated successfully');

  console.log(`\nFiles generated in: ${outputDir}`);
  console.log('\nNext steps:');
  console.log('1. Upload your site to production');
  console.log(
    `2. Submit ${BASE_URL}/sitemap.xml to Google Search Console`
  );
  console.log(
    `3. Verify ${BASE_URL}/robots.txt is accessible in your browser`
  );
} catch (error) {
  console.error('Error generating sitemap:', error);
  process.exit(1);
}
