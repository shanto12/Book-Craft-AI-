import JSZip from 'jszip';
import { Book } from '../types';

const fetchAndEncodeImage = async (url: string): Promise<{ data: ArrayBuffer, mimeType: string }> => {
    const response = await fetch(url);
    const blob = await response.blob();
    const data = await blob.arrayBuffer();
    return { data, mimeType: blob.type };
};

const createXHTML = (title: string, bodyContent: string): string => {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${title}</title>
  <link href="../css/style.css" rel="stylesheet" type="text/css" />
</head>
<body>
  ${bodyContent}
</body>
</html>`;
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

    // 3. CSS
    cssFolder?.file("style.css", `
        body { font-family: serif; line-height: 1.6; }
        h1, h2 { text-align: center; }
        img { max-width: 100%; height: auto; display: block; margin: 1em auto; }
        .dedication { text-align: center; font-style: italic; margin-top: 5em; margin-bottom: 5em; }
        .epigraph { font-style: italic; color: #555; margin-bottom: 2em; text-align: left; }
    `);

    // 4. Content files (Cover, Dedication, Preface, Chapters, Author)
    const coverImageInfo = await fetchAndEncodeImage(book.coverImageUrl);
    const coverExt = coverImageInfo.mimeType.split('/')[1] || 'jpeg';
    imagesFolder?.file(`cover.${coverExt}`, coverImageInfo.data);
    textFolder?.file("cover.xhtml", createXHTML(book.title, `<h1>${book.title}</h1><h2>by ${book.author.name}</h2><img src="../images/cover.${coverExt}" alt="Cover Image" />`));
    textFolder?.file("dedication.xhtml", createXHTML("Dedication", `<div class="dedication"><p>${book.dedication}</p></div>`));
    textFolder?.file("preface.xhtml", createXHTML("Preface", `<h2>Preface</h2><p>${book.preface.replace(/\n/g, '<br/>')}</p>`));

    const chapterImageInfos = await Promise.all(book.chapters.map(ch => fetchAndEncodeImage(ch.imageUrl)));

    book.chapters.forEach((chapter, index) => {
        const imageInfo = chapterImageInfos[index];
        const imgExt = imageInfo.mimeType.split('/')[1] || 'jpeg';
        const imgFileName = `chapter_${index + 1}.${imgExt}`;
        imagesFolder?.file(imgFileName, imageInfo.data);

        const chapterBody = `<h2>Chapter ${index + 1}: ${chapter.title}</h2>
        <div class="epigraph">"${chapter.epigraph}"</div>
        <img src="../images/${imgFileName}" alt="${chapter.title}" />
        <p>${chapter.content.replace(/\n/g, '<br/>')}</p>`;
        textFolder?.file(`chapter_${index + 1}.xhtml`, createXHTML(chapter.title, chapterBody));
    });

    textFolder?.file("author.xhtml", createXHTML("About the Author", `<h2>About the Author</h2><h3>${book.author.name}</h3><p>${book.author.bio.replace(/\n/g, '<br/>')}</p>`));

    // 5. OPF (Manifest, Metadata, Spine)
    const manifestItems = `
        <item id="css" href="css/style.css" media-type="text/css"/>
        <item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>
        <item id="dedication" href="text/dedication.xhtml" media-type="application/xhtml+xml"/>
        <item id="preface" href="text/preface.xhtml" media-type="application/xhtml+xml"/>
        ${book.chapters.map((_, i) => `<item id="chapter_${i + 1}" href="text/chapter_${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('')}
        <item id="author" href="text/author.xhtml" media-type="application/xhtml+xml"/>
        <item id="cover-image" href="images/cover.${coverExt}" media-type="${coverImageInfo.mimeType}"/>
        ${chapterImageInfos.map((info, i) => `<item id="img_chapter_${i + 1}" href="images/chapter_${i + 1}.${info.mimeType.split('/')[1]}" media-type="${info.mimeType}"/>`).join('')}
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    `;
    const spineItems = `
        <itemref idref="cover" linear="no"/>
        <itemref idref="dedication"/>
        <itemref idref="preface"/>
        ${book.chapters.map((_, i) => `<itemref idref="chapter_${i + 1}"/>`).join('')}
        <itemref idref="author"/>
    `;
    const contentOPF = `<?xml version="1.0" encoding="UTF-8"?>
<package version="2.0" unique-identifier="BookId" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${book.title}</dc:title>
    <dc:creator opf:role="aut">${book.author.name}</dc:creator>
    <dc:language>en</dc:language>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>${manifestItems}</manifest>
  <spine toc="ncx">${spineItems}</spine>
</package>`;
    oebps?.file("content.opf", contentOPF);

    // 6. NCX (Table of Contents)
    const navPoints = `
        <navPoint id="navPoint-1" playOrder="1"><navLabel><text>Dedication</text></navLabel><content src="text/dedication.xhtml"/></navPoint>
        <navPoint id="navPoint-2" playOrder="2"><navLabel><text>Preface</text></navLabel><content src="text/preface.xhtml"/></navPoint>
        ${book.chapters.map((ch, i) => `<navPoint id="navPoint-${i + 3}" playOrder="${i + 3}"><navLabel><text>Chapter ${i + 1}: ${ch.title}</text></navLabel><content src="text/chapter_${i + 1}.xhtml"/></navPoint>`).join('')}
        <navPoint id="navPoint-${book.chapters.length + 3}" playOrder="${book.chapters.length + 3}"><navLabel><text>About the Author</text></navLabel><content src="text/author.xhtml"/></navPoint>
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