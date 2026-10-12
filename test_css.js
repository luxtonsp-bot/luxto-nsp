const { JSDOM } = require('jsdom');
const fs = require('fs');

const html = fs.readFileSync('pages/dashboard.html', 'utf8');
console.log('HTML loaded, length:', html.length);

try {
  const dom = new JSDOM(html);
  console.log('JSDOM created successfully');
  
  const styleElements = [...dom.window.document.querySelectorAll('style')];
  console.log('Found', styleElements.length, 'style elements');
  
  styleElements.forEach((style, index) => {
    const css = style.textContent || style.innerHTML || '';
    console.log('Style', index, 'length:', css.length);
    console.log('CSS content:');
    console.log('---');
    console.log(css);
    console.log('---');
  });
} catch (e) {
  console.error('Error creating JSDOM:', e.message);
}
