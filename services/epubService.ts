
import JSZip from 'jszip';
import { Book } from '../types';

const fetchAndEncodeImage = async (url: string): Promise<{ data: ArrayBuffer, mimeType: string, ext: string }> => {
    const response = await fetch(url);
    const blob = await response.blob();
    const data = await blob.arrayBuffer();
    const mimeType = blob.type;
    const ext = mimeType.split('/')[1] || 'jpeg';
    return { data, mimeType, ext };
};

const createXHTML = (title: string, bodyContent: string, headContent: string = ''): string => {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <title>${title}</title>
  <link href="../css/style.css" rel="stylesheet" type="text/css" />
  ${headContent}
</head>
<body>
  ${bodyContent}
</body>
</html>`;
};

const formatParagraphs = (text: string): string => {
    if (!text) return '';
    return text.split('\n').filter(p => p.trim() !== '').map(p => `<p class="para">${p.trim()}</p>`).join('\n');
};

export const generateEpub = async (book: Book): Promise<Blob> => {
    const zip = new JSZip();

    // 1. Mimetype file (must be first and uncompressed)
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

    // 2. META-INF/container.xml
    const containerXML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
    zip.folder("META-INF")?.file("container.xml", containerXML);

    const oebps = zip.folder("OEBPS");
    const textFolder = oebps?.folder("text");
    const cssFolder = oebps?.folder("css");
    const imagesFolder = oebps?.folder("images");
    const fontsFolder = oebps?.folder("fonts");
    
    // 3. Fonts and CSS
    const fontCss = `
        @font-face {
            font-family: "${book.theme.fontPairing.heading}";
            src: url(../fonts/heading.woff2) format('woff2');
            font-weight: normal;
            font-style: normal;
        }
        @font-face {
            font-family: "${book.theme.fontPairing.body}";
            src: url(../fonts/body.woff2) format('woff2');
            font-weight: normal;
            font-style: normal;
        }
    `;

    // Fetch font files from Google Fonts API
    try {
        const fontUrlResponse = await fetch(book.theme.fontPairing.url);
        const fontUrlCss = await fontUrlResponse.text();
        const headingFontUrlMatch = fontUrlCss.match(new RegExp(`font-family: '${book.theme.fontPairing.heading}'.*?url\\((.*?)\\)`, 's'));
        const bodyFontUrlMatch = fontUrlCss.match(new RegExp(`font-family: '${book.theme.fontPairing.body}'.*?url\\((.*?)\\)`, 's'));

        if (headingFontUrlMatch?.[1] && bodyFontUrlMatch?.[1]) {
            const headingFontFile = await fetch(headingFontUrlMatch[1]).then(res => res.arrayBuffer());
            const bodyFontFile = await fetch(bodyFontUrlMatch[1]).then(res => res.arrayBuffer());
            fontsFolder?.file("heading.woff2", headingFontFile);
            fontsFolder?.file("body.woff2", bodyFontFile);
        }
    } catch(e) {
        console.error("Could not fetch or embed fonts, using serif fallback.", e)
    }

    cssFolder?.file("style.css", `
        ${fontCss}
        body { font-family: "${book.theme.fontPairing.body}", serif; line-height: 1.6; margin: 1em; }
        h1, h2, h3 { font-family: "${book.theme.fontPairing.heading}", sans-serif; text-align: center; line-height: 1.2; margin-top: 1.5em; margin-bottom: 1em; page-break-before: always; page-break-after: avoid; }
        h1 { font-size: 2.5em; }
        h2 { font-size: 2em; }
        h3 { font-size: 1.5em; text-align: left; }
        p.para { margin: 0 0 1em 0; text-align: justify; text-indent: 1.5em; }
        img { max-width: 100%; height: auto; display: block; margin: 1.5em auto; }
        .cover-image { width: 100%; height: auto; }
        .title-page { text-align: center; margin: 5em 0; page-break-before: always; }
        .copyright-page { font-size: 0.8em; color: #555; margin: 2em; page-break-before: always; }
        .copyright-page p { text-indent: 0; }
        .dedication { text-align: center; font-style: italic; margin: 10em 2em; page-break-before: always; }
        .epigraph { font-style: italic; color: #555; margin: 3em 2em 3em 2em; text-align: left; text-indent: 0; }
        .toc { list-style-type: none; padding: 0; }
        .toc li a { text-decoration: none; color: inherit; }
        .character-profile { margin-bottom: 1.5em; }
        .character-profile h3 { margin-bottom: 0.25em; }
        .character-profile p { text-indent: 0 !important; }
    `);

    // 4. Content files (Cover, Title, Copyright, Dedication, ToC, Characters, Preface, Chapters, Author)
    const coverImageInfo = await fetchAndEncodeImage(book.coverImageUrl);
    imagesFolder?.file(`cover.${coverImageInfo.ext}`, coverImageInfo.data);
    textFolder?.file("cover.xhtml", createXHTML("Cover", `<div class="cover-container"><img src="../images/cover.${coverImageInfo.ext}" alt="Cover Image" class="cover-image"/></div>`));
    textFolder?.file("title-page.xhtml", createXHTML(book.title, `<div class="title-page"><h1>${book.title}</h1><h3>by</h3><h2>${book.author.name}</h2><br/><br/><p>${book.publisher}</p></div>`));
    textFolder?.file("copyright.xhtml", createXHTML("Copyright", `<div class="copyright-page"><p>Copyright &copy; ${new Date().getFullYear()} by ${book.author.name}</p><p>Published by ${book.publisher}</p><br/><p>All rights reserved.</p></div>`));
    textFolder?.file("dedication.xhtml", createXHTML("Dedication", `<div class="dedication"><p>${book.dedication}</p></div>`));
    
    // HTML Table of Contents
    const tocHTML = `<h1>Table of Contents</h1>
    <ol class="toc">
      <li><a href="dramatis-personae.xhtml">Dramatis Personae</a></li>
      <li><a href="preface.xhtml">Preface</a></li>
      ${book.chapters.map((ch, i) => `<li><a href="chapter_${i + 1}.xhtml">Chapter ${i + 1}: ${ch.title}</a></li>`).join('')}
      <li><a href="author.xhtml">About the Author</a></li>
    </ol>`;
    textFolder?.file("toc.xhtml", createXHTML("Table of Contents", tocHTML));

    // Dramatis Personae
    const charactersHTML = `<h2>Dramatis Personae</h2>
    ${book.mainCharacters.map(char => `
      <div class="character-profile">
        <h3>${char.name} <em>- ${char.role}</em></h3>
        <p>${char.description}</p>
      </div>
    `).join('')}`;
    textFolder?.file("dramatis-personae.xhtml", createXHTML("Dramatis Personae", charactersHTML));


    textFolder?.file("preface.xhtml", createXHTML("Preface", `<h2>Preface</h2>${formatParagraphs(book.preface)}`));

    const chapterImageInfos = await Promise.all(book.chapters.map(ch => fetchAndEncodeImage(ch.imageUrl)));

    book.chapters.forEach((chapter, index) => {
        const imageInfo = chapterImageInfos[index];
        const imgFileName = `chapter_${index + 1}.${imageInfo.ext}`;
        imagesFolder?.file(imgFileName, imageInfo.data);

        const chapterBody = `<h2>Chapter ${index + 1}: ${chapter.title}</h2>
        <div class="epigraph">"${chapter.epigraph}"</div>
        <img src="../images/${imgFileName}" alt="${chapter.title}" />
        ${formatParagraphs(chapter.content)}`;
        textFolder?.file(`chapter_${index + 1}.xhtml`, createXHTML(chapter.title, chapterBody));
    });
    
    const authorBio = `<h2>About the Author</h2><h3>${book.author.name}</h3>${formatParagraphs(book.author.bio)}`;
    textFolder?.file("author.xhtml", createXHTML("About the Author", authorBio));


    // 5. OPF (Manifest, Metadata, Spine)
    const manifestItems = `
        <item id="css" href="css/style.css" media-type="text/css"/>
        <item id="heading-font" href="fonts/heading.woff2" media-type="font/woff2" />
        <item id="body-font" href="fonts/body.woff2" media-type="font/woff2" />
        <item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>
        <item id="title-page" href="text/title-page.xhtml" media-type="application/xhtml+xml"/>
        <item id="copyright" href="text/copyright.xhtml" media-type="application/xhtml+xml"/>
        <item id="dedication" href="text/dedication.xhtml" media-type="application/xhtml+xml"/>
        <item id="toc" href="text/toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        <item id="dramatis-personae" href="text/dramatis-personae.xhtml" media-type="application/xhtml+xml"/>
        <item id="preface" href="text/preface.xhtml" media-type="application/xhtml+xml"/>
        ${book.chapters.map((_, i) => `<item id="chapter_${i + 1}" href="text/chapter_${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('')}
        <item id="author" href="text/author.xhtml" media-type="application/xhtml+xml"/>
        <item id="cover-image" href="images/cover.${coverImageInfo.ext}" media-type="${coverImageInfo.mimeType}" properties="cover-image"/>
        ${chapterImageInfos.map((info, i) => `<item id="img_chapter_${i + 1}" href="images/chapter_${i + 1}.${info.ext}" media-type="${info.mimeType}"/>`).join('')}
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    `;
    const spineItems = `
        <itemref idref="cover" linear="no"/>
        <itemref idref="title-page"/>
        <itemref idref="copyright"/>
        <itemref idref="dedication"/>
        <itemref idref="toc"/>
        <itemref idref="dramatis-personae"/>
        <itemref idref="preface"/>
        ${book.chapters.map((_, i) => `<itemref idref="chapter_${i + 1}"/>`).join('')}
        <itemref idref="author"/>
    `;
    const contentOPF = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="BookId" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${book.title}</dc:title>
    <dc:creator id="creator">${book.author.name}</dc:creator>
    <meta refines="#creator" property="role" scheme="marc:relators">aut</meta>
    <dc:description>${book.backCoverBlurb}</dc:description>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().split('.')[0] + 'Z'}</meta>
  </metadata>
  <manifest>${manifestItems}</manifest>
  <spine toc="ncx">${spineItems}</spine>
</package>`;
    oebps?.file("content.opf", contentOPF);

    // 6. NCX (Table of Contents for older devices)
    const navPoints = `
        <navPoint id="navPoint-1" playOrder="1"><navLabel><text>Cover</text></navLabel><content src="text/cover.xhtml"/></navPoint>
        <navPoint id="navPoint-2" playOrder="2"><navLabel><text>Title Page</text></navLabel><content src="text/title-page.xhtml"/></navPoint>
        <navPoint id="navPoint-3" playOrder="3"><navLabel><text>Table of Contents</text></navLabel><content src="text/toc.xhtml"/></navPoint>
        <navPoint id="navPoint-4" playOrder="4"><navLabel><text>Dramatis Personae</text></navLabel><content src="text/dramatis-personae.xhtml"/></navPoint>
        <navPoint id="navPoint-5" playOrder="5"><navLabel><text>Dedication</text></navLabel><content src="text/dedication.xhtml"/></navPoint>
        <navPoint id="navPoint-6" playOrder="6"><navLabel><text>Preface</text></navLabel><content src="text/preface.xhtml"/></navPoint>
        ${book.chapters.map((ch, i) => `<navPoint id="navPoint-${i + 7}" playOrder="${i + 7}"><navLabel><text>Chapter ${i + 1}: ${ch.title}</text></navLabel><content src="text/chapter_${i + 1}.xhtml"/></navPoint>`).join('')}
        <navPoint id="navPoint-${book.chapters.length + 7}" playOrder="${book.chapters.length + 7}"><navLabel><text>About the Author</text></navLabel><content src="text/author.xhtml"/></navPoint>
    `;
    const tocNCX = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx version="2005-1" xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <head>
    <meta name="dtb:uid" content="BookId"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${book.title}</text></docTitle>
  <navMap>${navPoints}</navMap>
</ncx>`;
    oebps?.file("toc.ncx", tocNCX);

    return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
};
