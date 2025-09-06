import React, { useState, useCallback, useRef, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';

import { Book, GenerationStatus, Chapter } from './types';
import * as geminiService from './services/geminiService';
import { generateEpub } from './services/epubService';
import { BookIcon, DownloadIcon, SparkleIcon, PackageIcon } from './components/Icons';

// Helper component defined outside App to prevent re-creation on re-renders
const PdfDocument: React.FC<{ book: Book | null, a4Ref: React.RefObject<HTMLDivElement> }> = ({ book, a4Ref }) => {
    if (!book) return null;
    
    const styles = `
      @import url('${book.theme.fontPairing.url}');
      .drop-cap::first-letter {
        font-size: 4em;
        font-family: '${book.theme.fontPairing.body}', serif;
        font-weight: bold;
        float: left;
        line-height: 0.75;
        margin-right: 0.05em;
        padding-top: 0.1em;
      }
      .page-header {
        position: absolute;
        top: 10mm;
        left: 20mm;
        right: 20mm;
        height: 10mm;
        font-size: 9pt;
        color: #666;
        display: flex;
        justify-content: space-between;
        border-bottom: 1px solid #ddd;
        padding-bottom: 2mm;
      }
      .page-footer {
        position: absolute;
        bottom: 10mm;
        left: 20mm;
        right: 20mm;
        height: 5mm;
        font-size: 9pt;
        color: #666;
        text-align: center;
      }
    `;

    const pageStyle: React.CSSProperties = {
        width: '210mm',
        minHeight: '297mm',
        padding: '20mm',
        backgroundColor: 'white',
        color: 'black',
        pageBreakAfter: 'always',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
    };
    
    const headingStyle: React.CSSProperties = { fontFamily: `'${book.theme.fontPairing.heading}', sans-serif` };
    const bodyStyle: React.CSSProperties = { fontFamily: `'${book.theme.fontPairing.body}', serif` };

    const chapterContentStyle: React.CSSProperties = {
        ...bodyStyle,
        columnCount: 1, 
        columnGap: '1cm',
        fontSize: '12pt',
        lineHeight: '1.6',
        whiteSpace: 'pre-wrap',
        textAlign: 'left', // Changed from 'justify' to 'left' to fix PDF rendering bug
        paddingTop: '15mm',
        paddingBottom: '10mm',
    };
    
    let pageCounter = 1;

    return (
        <div ref={a4Ref} style={{ position: 'absolute', left: '-9999px', top: 0 }}>
             <style>{styles}</style>
             
             {/* Cover Page */}
            <div style={{...pageStyle, padding: 0}} className="flex flex-col items-center justify-center text-center">
                <img src={book.coverImageUrl} alt="Book Cover" className="w-full h-full object-cover" />
            </div>

            {/* Title Page */}
            <div style={{...pageStyle, justifyContent: 'center', alignItems: 'center', textAlign: 'center'}}>
                <div className="flex-grow"></div>
                <h1 style={headingStyle} className="text-5xl">{book.title}</h1>
                <p style={bodyStyle} className="text-2xl mt-4 mb-16">by {book.author.name}</p>
                <div className="flex-grow"></div>
                <p style={bodyStyle} className="text-lg">{book.publisher}</p>
            </div>

            {/* Copyright Page */}
            <div style={{...pageStyle, justifyContent: 'flex-end'}}>
                <div style={bodyStyle} className="text-sm text-gray-600">
                    <p>Copyright &copy; {new Date().getFullYear()} by {book.author.name}</p>
                    <p>Published by {book.publisher}</p>
                    <br/>
                    <p>All rights reserved. No part of this publication may be reproduced, distributed, or transmitted in any form or by any means, including photocopying, recording, or other electronic or mechanical methods, without the prior written permission of the publisher, except in the case of brief quotations embodied in critical reviews and certain other noncommercial uses permitted by copyright law.</p>
                    <br/>
                    <p>This is a work of fiction. Names, characters, businesses, places, events, and incidents are either the products of the author's imagination or used in a fictitious manner. Any resemblance to actual persons, living or dead, or actual events is purely coincidental.</p>
                </div>
            </div>
            
            {/* Dedication Page */}
            <div style={{...pageStyle, justifyContent: 'center', alignItems: 'center'}}>
                 <div className="page-footer">{pageCounter++}</div>
                 <div style={bodyStyle} className="text-center italic text-gray-700 text-lg">
                    {book.dedication}
                 </div>
            </div>

            {/* Table of Contents */}
            <div style={pageStyle}>
                 <div className="page-header"><span>Table of Contents</span><span></span></div>
                 <div className="page-footer">{pageCounter++}</div>
                 <div style={{paddingTop: '15mm'}}>
                     <h2 style={headingStyle} className="text-3xl mb-8 border-b pb-2 text-center">Table of Contents</h2>
                     <ul className="space-y-3">
                        <li style={bodyStyle} className="text-lg">Preface</li>
                        {book.chapters.map((chapter, index) => (
                            <li key={index} style={bodyStyle} className="text-lg">Chapter {index + 1}: {chapter.title}</li>
                        ))}
                        <li style={bodyStyle} className="text-lg">About the Author</li>
                     </ul>
                </div>
            </div>

            {/* Preface Page */}
            <div style={pageStyle}>
                <div className="page-header"><span>{book.title}</span><span>Preface</span></div>
                <div className="page-footer">{pageCounter++}</div>
                <div style={chapterContentStyle}>
                    <h2 style={headingStyle} className="text-3xl mb-6 border-b pb-2">Preface</h2>
                    <div className="drop-cap">{book.preface}</div>
                </div>
            </div>

            {/* Chapters */}
            {book.chapters.map((chapter, index) => (
                <div key={index} style={pageStyle}>
                    <div className="page-header"><span>{book.title}</span><span>Chapter {index + 1}</span></div>
                    <div className="page-footer">{pageCounter++}</div>
                    <div style={chapterContentStyle}>
                        <h2 style={headingStyle} className="text-3xl mb-2">{`Chapter ${index + 1}: ${chapter.title}`}</h2>
                        <p style={bodyStyle} className="text-md italic text-gray-600 mb-6 border-b pb-4">"{chapter.epigraph}"</p>
                        {chapter.imageUrl && <img src={chapter.imageUrl} alt={`Illustration for ${chapter.title}`} className="w-full max-w-[150mm] h-auto mx-auto my-6 shadow-lg rounded-md" />}
                        <div className="drop-cap">{chapter.content}</div>
                    </div>
                </div>
            ))}
            {/* About Author */}
             <div style={pageStyle}>
                <div className="page-header"><span>{book.title}</span><span>About the Author</span></div>
                <div className="page-footer">{pageCounter++}</div>
                <div style={chapterContentStyle}>
                    <h2 style={headingStyle} className="text-3xl mb-6 border-b pb-2">About the Author</h2>
                    <p style={headingStyle} className="text-2xl mb-4">{book.author.name}</p>
                    <div style={{whiteSpace: 'pre-wrap'}}>{book.author.bio}</div>
                     {book.author.alsoByAuthor && book.author.alsoByAuthor.length > 0 && (
                        <div className="mt-12">
                            <h3 style={headingStyle} className="text-2xl mb-4">Also by {book.author.name}</h3>
                            <ul className="list-disc list-inside">
                                {book.author.alsoByAuthor.map((title, i) => (
                                    <li key={i} style={bodyStyle} className="text-lg italic">{title}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
            {/* Back Cover */}
            <div style={{...pageStyle, backgroundColor: '#2d3748', color: 'white', padding: '20mm', boxSizing: 'border-box'}} className="flex flex-col items-center justify-center text-center">
                <div className="border-4 border-white p-8">
                    <p style={bodyStyle} className="text-xl leading-relaxed">{book.backCoverBlurb}</p>
                </div>
            </div>
        </div>
    );
};


export default function App() {
    const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.Idle);
    const [prompt, setPrompt] = useState<string>('');
    const [book, setBook] = useState<Book | null>(null);
    const [progress, setProgress] = useState({ task: '', percentage: 0 });
    const [error, setError] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    
    const pdfRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        if (book?.theme?.fontPairing?.url) {
            const link = document.createElement('link');
            link.href = book.theme.fontPairing.url;
            link.rel = 'stylesheet';
            document.head.appendChild(link);
            return () => {
                document.head.removeChild(link);
            };
        }
    }, [book?.theme?.fontPairing?.url]);


    const updateChapterInBook = (chapterIndex: number, updatedData: Partial<Chapter>) => {
        setBook(prevBook => {
            if (!prevBook) return null;
            const newChapters = [...prevBook.chapters];
            newChapters[chapterIndex] = { ...newChapters[chapterIndex], ...updatedData };
            return { ...prevBook, chapters: newChapters };
        });
    };

    const handleGenerateBook = useCallback(async () => {
        if (!prompt.trim()) {
            setError('Please enter a book idea.');
            return;
        }
        if (!process.env.API_KEY) {
            setError("API Key is not configured. Please set the API_KEY environment variable.");
            setStatus(GenerationStatus.Error);
            return;
        }

        setError(null);
        setBook(null);

        try {
            // 1. Generate the detailed book plan (now includes all text metadata)
            setStatus(GenerationStatus.GeneratingPlot);
            setProgress({ task: 'Developing plot & publishing details...', percentage: 5 });
            const plan = await geminiService.generateBookPlan(prompt);
            
            // 2. Generate Cover Image while setting initial book state
            setProgress({ task: 'Designing book cover...', percentage: 10 });
            const coverImageUrl = await geminiService.generateImage(plan.coverPrompt, plan.theme.imageStyle);
            
            const initialBook: Book = { ...plan, coverImageUrl };
            setBook(initialBook);
            
            const totalChapters = plan.chapters.length;

            // 3. Generate Chapter Content in Parallel
            setStatus(GenerationStatus.GeneratingChapters);
            setProgress({ task: `Writing ${totalChapters} chapters...`, percentage: 20 });
            const contentPromises = plan.chapters.map((ch, i) =>
                geminiService.generateChapterContent(plan.title, plan.plotSummary, plan.mainCharacters, ch, i > 0 ? plan.chapters[i-1].summary : null)
            );
            const rawContents = await Promise.all(contentPromises);
            rawContents.forEach((content, i) => updateChapterInBook(i, { content }));
            
            // 4. Proofread in Parallel
            setStatus(GenerationStatus.Proofreading);
            setProgress({ task: 'Proofreading the manuscript...', percentage: 60 });
            const proofreadPromises = rawContents.map(content => geminiService.proofreadText(content));
            const proofreadContents = await Promise.all(proofreadPromises);
            proofreadContents.forEach((content, i) => updateChapterInBook(i, { content }));

            // 5. Generate Images in Parallel
            setStatus(GenerationStatus.GeneratingImages);
            setProgress({ task: 'Creating illustrations...', percentage: 85 });
            const imagePromises = plan.chapters.map(ch => geminiService.generateImage(ch.imagePrompt, initialBook.theme.imageStyle));
            const imageUrls = await Promise.all(imagePromises);
            imageUrls.forEach((imageUrl, i) => updateChapterInBook(i, { imageUrl }));

            setProgress({ task: 'Finalizing your masterpiece...', percentage: 100 });
            setStatus(GenerationStatus.Complete);

        } catch (e) {
            console.error(e);
            setError(e instanceof Error ? e.message : 'An unknown error occurred.');
            setStatus(GenerationStatus.Error);
        }
    }, [prompt]);

    const handlePrepareKdpPackage = async () => {
        if (!book) return;
        setIsDownloading(true);
        try {
            const zip = new JSZip();

            // 1. Generate EPUB
            const epubBlob = await generateEpub(book);
            zip.file("manuscript.epub", epubBlob);

            // 2. Get Cover Image
            const coverResponse = await fetch(book.coverImageUrl);
            const coverBlob = await coverResponse.blob();
            zip.file("cover.jpeg", coverBlob);

            // 3. Create Metadata file
            const metadata = `Book Title: ${book.title}
Author Name: ${book.author.name}

Book Description (Blurb):
${book.backCoverBlurb}

KDP Keywords:
${book.kdpKeywords.join(', ')}

KDP Categories (choose 2-3):
${book.kdpCategories.join('\n')}
`;
            zip.file("metadata.txt", metadata);

            // 4. Generate and download zip
            const zipBlob = await zip.generateAsync({ type: "blob" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = `KDP_Package_${book.title.replace(/\s/g, '_')}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

        } catch (err) {
            console.error("Failed to generate KDP package:", err);
            setError("Sorry, there was an error creating the KDP package.");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDownloadPdf = async () => {
        if (!pdfRef.current || !book) return;

        setIsDownloading(true);
        try {
            const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
            const pages = pdfRef.current.children;

            for (let i = 1; i < pages.length; i++) { // Skip the <style> tag
                const page = pages[i] as HTMLElement;
                const canvas = await html2canvas(page, { scale: 2, useCORS: true, logging: false });
                if (i > 1) doc.addPage();
                doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');
            }
            doc.save(`${book.title.replace(/\s/g, '_')}.pdf`);
        } catch (err) {
            console.error("Failed to generate PDF:", err);
            setError("Sorry, there was an error creating the PDF.");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDownloadEpub = async () => {
        if (!book) return;
        setIsDownloading(true);
        try {
            const epubBlob = await generateEpub(book);
            const link = document.createElement('a');
            link.href = URL.createObjectURL(epubBlob);
            link.download = `${book.title.replace(/\s/g, '_')}.epub`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        } catch(err) {
            console.error("Failed to generate EPUB:", err);
            setError("Sorry, there was an error creating the EPUB file.");
        } finally {
            setIsDownloading(false);
        }
    };
    
    const renderStatusMessages = () => {
        switch(status) {
            case GenerationStatus.GeneratingPlot:
                return "Our AI is developing a captivating plot, fleshing out characters, and designing a unique theme for your book.";
            case GenerationStatus.GeneratingChapters:
                 return "The author is now writing the full text for every chapter, guided by the detailed character profiles. This is the most time-consuming step.";
            case GenerationStatus.Proofreading:
                return "A meticulous AI editor is now proofreading the entire manuscript for errors and clarity.";
            case GenerationStatus.GeneratingImages:
                return "Our AI artist is creating beautiful, thematic illustrations for each chapter.";
            default:
                return "Our AI author is hard at work. Please be patient, creating a masterpiece takes time.";
        }
    }

    const renderContent = () => {
        switch (status) {
            case GenerationStatus.Idle:
            case GenerationStatus.Error:
                return (
                    <div className="w-full max-w-2xl text-center">
                        <BookIcon className="mx-auto h-16 w-16 text-indigo-300"/>
                        <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-6xl">BookCraft AI</h1>
                        <p className="mt-6 text-lg leading-8 text-gray-300">Turn your wildest ideas into professionally written and illustrated books, ready for Kindle publishing.</p>
                        <div className="mt-10 w-full">
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                className="w-full p-4 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow duration-300"
                                rows={4}
                                placeholder="e.g., A sci-fi mystery about a detective solving a murder on a terraformed Mars."
                                aria-label="Book idea prompt"
                            />
                            <button
                                onClick={handleGenerateBook}
                                disabled={status !== GenerationStatus.Idle && status !== GenerationStatus.Error}
                                className="mt-6 flex items-center justify-center w-full sm:w-auto sm:px-12 py-4 bg-indigo-600 text-white font-semibold rounded-lg shadow-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105"
                            >
                                <SparkleIcon className="w-5 h-5 mr-2"/>
                                Create My Book
                            </button>
                            {error && <p className="mt-4 text-red-400" role="alert">{error}</p>}
                        </div>
                    </div>
                );
            case GenerationStatus.Complete:
                return (
                    <div className="w-full max-w-4xl text-left">
                        <h1 className="text-4xl font-bold text-white text-center">Your Masterpiece is Ready!</h1>
                        {book && (
                            <div className="mt-8 bg-gray-800/50 p-6 sm:p-8 rounded-lg shadow-2xl backdrop-blur-sm border border-gray-700">
                                <div className="flex flex-col md:flex-row gap-8">
                                    <img src={book.coverImageUrl} alt="Book Cover" className="w-full md:w-1/3 h-auto object-cover rounded-md shadow-lg" />
                                    <div className="flex-1 flex flex-col">
                                        <h2 className="text-3xl text-white" style={{fontFamily: `'${book.theme.fontPairing.heading}', sans-serif`}}>{book.title}</h2>
                                        <p className="text-xl text-gray-300 mt-2">by {book.author.name}</p>
                                        <p className="text-md text-gray-400">Published by {book.publisher}</p>
                                        <p className="mt-4 text-gray-400 italic" style={{fontFamily: `'${book.theme.fontPairing.body}', serif`}}>{book.preface.substring(0, 200)}...</p>
                                        
                                        <div className="mt-4 border-t border-gray-700 pt-4">
                                            <h3 className="text-sm font-semibold text-gray-200">Suggested KDP Categories:</h3>
                                            <ul className="text-xs text-gray-400 mt-1 space-y-1">
                                                {book.kdpCategories.map(cat => <li key={cat}>- {cat}</li>)}
                                            </ul>
                                        </div>

                                        <div className="mt-auto pt-6">
                                            <button
                                                onClick={handlePrepareKdpPackage}
                                                disabled={isDownloading}
                                                className="flex items-center justify-center w-full px-6 py-4 bg-amber-600 text-white font-semibold rounded-lg shadow-lg hover:bg-amber-700 disabled:bg-gray-500 transition-all duration-300"
                                            >
                                                {isDownloading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <PackageIcon className="w-5 h-5 mr-2" />}
                                                <span className="ml-2">{isDownloading ? 'Packaging...' : 'Prepare for KDP'}</span>
                                            </button>
                                            <p className="text-xs text-gray-400 mt-2 text-center">Downloads a .zip with your manuscript, cover, and metadata for Amazon KDP.</p>
                                            <div className="mt-4 grid grid-cols-2 gap-4">
                                                <button
                                                    onClick={handleDownloadPdf}
                                                    disabled={isDownloading}
                                                    className="flex items-center justify-center w-full px-6 py-3 bg-green-600/80 text-white font-semibold rounded-lg shadow-lg hover:bg-green-700 disabled:bg-gray-500 transition-all duration-300"
                                                >
                                                    <DownloadIcon className="w-5 h-5 mr-2" />
                                                    <span className="ml-2">Download PDF</span>
                                                </button>
                                                <button
                                                    onClick={handleDownloadEpub}
                                                    disabled={isDownloading}
                                                    className="flex items-center justify-center w-full px-6 py-3 bg-blue-600/80 text-white font-semibold rounded-lg shadow-lg hover:bg-blue-700 disabled:bg-gray-500 transition-all duration-300"
                                                >
                                                    <BookIcon className="w-5 h-5 mr-2" />
                                                    <span className="ml-2">Download EPUB</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            default:
                return (
                    <div className="w-full max-w-2xl text-center">
                        <h1 className="text-4xl font-bold text-white">Your Book is Being Written...</h1>
                        <p className="mt-4 text-lg text-gray-300">{renderStatusMessages()}</p>
                        <div className="mt-8 w-full bg-gray-700/50 rounded-full h-4 overflow-hidden border border-gray-600">
                            <div
                                className="bg-indigo-600 h-full rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${progress.percentage}%` }}
                                role="progressbar"
                                aria-valuenow={progress.percentage}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label="Book generation progress"
                            ></div>
                        </div>
                        <p className="mt-4 text-indigo-300 font-medium animate-pulse">{progress.task}</p>
                    </div>
                );
        }
    };

    return (
        <main className="relative min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 overflow-hidden">
             <div className="absolute inset-0 bg-grid-gray-700/[0.2] [mask-image:linear-gradient(to_bottom,white_5%,transparent_100%)]"></div>
             <div className="relative z-10 flex items-center justify-center w-full min-h-screen">
                {renderContent()}
             </div>
             { status === GenerationStatus.Complete && <PdfDocument book={book} a4Ref={pdfRef} /> }
        </main>
    );
}