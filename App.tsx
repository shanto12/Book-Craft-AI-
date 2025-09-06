import React, { useState, useCallback, useRef } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

import { Book, GenerationStatus, Chapter } from './types';
import * as geminiService from './services/geminiService';
import { generateEpub } from './services/epubService';
import { BookIcon, DownloadIcon, SparkleIcon } from './components/Icons';

// Helper component defined outside App to prevent re-creation on re-renders
const PdfDocument: React.FC<{ book: Book | null, a4Ref: React.RefObject<HTMLDivElement> }> = ({ book, a4Ref }) => {
    if (!book) return null;
    
    const pageStyle: React.CSSProperties = {
        width: '210mm',
        minHeight: '297mm',
        backgroundColor: 'white',
        color: 'black',
        pageBreakAfter: 'always',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
    };

    const chapterContentStyle: React.CSSProperties = {
        columnCount: 1, 
        columnGap: '1cm',
        fontSize: '12pt',
        lineHeight: '1.6',
        fontFamily: 'Lora, serif',
        whiteSpace: 'pre-wrap',
        textAlign: 'justify',
    };

    return (
        <div ref={a4Ref} style={{ position: 'absolute', left: '-9999px', top: 0 }}>
             {/* Cover Page */}
            <div style={pageStyle} className="p-16 flex flex-col items-center justify-center text-center">
                <img src={book.coverImageUrl} alt="Book Cover" className="w-full h-auto max-w-[150mm] max-h-[200mm] object-contain shadow-2xl" />
                <h1 className="text-5xl font-serif mt-8">{book.title}</h1>
                <p className="text-2xl mt-4 text-gray-700">{book.author.name}</p>
            </div>
            {/* Preface Page */}
            <div style={pageStyle} className="p-20">
                <h2 className="text-3xl font-serif mb-6 border-b pb-2">Preface</h2>
                <div style={chapterContentStyle}>{book.preface}</div>
            </div>
            {/* Chapters */}
            {book.chapters.map((chapter, index) => (
                <div key={index} style={pageStyle} className="p-20">
                    <h2 className="text-3xl font-serif mb-6 border-b pb-2">{`Chapter ${index + 1}: ${chapter.title}`}</h2>
                    {chapter.imageUrl && <img src={chapter.imageUrl} alt={`Illustration for ${chapter.title}`} className="w-full max-w-[150mm] h-auto mx-auto my-6 shadow-lg rounded-md" />}
                    <div style={chapterContentStyle}>{chapter.content}</div>
                </div>
            ))}
            {/* About Author */}
             <div style={pageStyle} className="p-20">
                <h2 className="text-3xl font-serif mb-6 border-b pb-2">About the Author</h2>
                <p className="text-2xl font-serif mb-4">{book.author.name}</p>
                <div style={chapterContentStyle}>{book.author.bio}</div>
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
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
    const [isDownloadingEpub, setIsDownloadingEpub] = useState(false);
    
    const pdfRef = useRef<HTMLDivElement>(null);

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
            // 1. Generate the detailed book plan
            setStatus(GenerationStatus.GeneratingPlot);
            setProgress({ task: 'Developing a captivating plot...', percentage: 5 });
            const plan = await geminiService.generateBookPlan(prompt);
            
            setProgress({ task: 'Designing book cover...', percentage: 10 });
            const coverImageUrl = await geminiService.generateImage(plan.coverPrompt);
            const initialBook: Book = { ...plan, coverImageUrl };
            setBook(initialBook);
            
            const totalChapters = plan.chapters.length;

            // 2. Generate Chapter Content in Parallel
            setStatus(GenerationStatus.GeneratingChapters);
            setProgress({ task: `Writing ${totalChapters} chapters...`, percentage: 20 });
            const contentPromises = plan.chapters.map((ch, i) =>
                geminiService.generateChapterContent(plan.title, plan.plotSummary, ch, i > 0 ? plan.chapters[i-1].summary : null)
            );
            const rawContents = await Promise.all(contentPromises);
            rawContents.forEach((content, i) => updateChapterInBook(i, { content }));
            
            // 3. Proofread in Parallel
            setStatus(GenerationStatus.Proofreading);
            setProgress({ task: 'Proofreading the manuscript...', percentage: 60 });
            const proofreadPromises = rawContents.map(content => geminiService.proofreadText(content));
            const proofreadContents = await Promise.all(proofreadPromises);
            proofreadContents.forEach((content, i) => updateChapterInBook(i, { content }));

            // 4. Generate Images in Parallel
            setStatus(GenerationStatus.GeneratingImages);
            setProgress({ task: 'Creating illustrations...', percentage: 85 });
            const imagePromises = plan.chapters.map(ch => geminiService.generateImage(ch.imagePrompt));
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

    const handleDownloadPdf = async () => {
        if (!pdfRef.current || !book) return;

        setIsDownloadingPdf(true);
        try {
            const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
            const pages = pdfRef.current.children;

            for (let i = 0; i < pages.length; i++) {
                const page = pages[i] as HTMLElement;
                const canvas = await html2canvas(page, { scale: 2, useCORS: true });
                if (i > 0) doc.addPage();
                doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');
            }
            doc.save(`${book.title.replace(/\s/g, '_')}.pdf`);
        } catch (err) {
            console.error("Failed to generate PDF:", err);
            setError("Sorry, there was an error creating the PDF.");
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    const handleDownloadEpub = async () => {
        if (!book) return;
        setIsDownloadingEpub(true);
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
            setIsDownloadingEpub(false);
        }
    };
    
    const renderStatusMessages = () => {
        switch(status) {
            case GenerationStatus.GeneratingPlot:
                return "Our AI is developing a captivating plot and outlining the chapters. This forms the soul of your book.";
            case GenerationStatus.GeneratingChapters:
                 return "The author is now writing the full text for every chapter. This is the most time-consuming step.";
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
                        <p className="mt-6 text-lg leading-8 text-gray-300">Turn your wildest ideas into beautifully written and illustrated books. Just provide a prompt, and let AI do the rest.</p>
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
                                    <div className="flex-1">
                                        <h2 className="text-3xl font-serif text-white">{book.title}</h2>
                                        <p className="text-xl text-gray-300 mt-2">by {book.author.name}</p>
                                        <p className="mt-4 text-gray-400 font-serif italic">{book.preface.substring(0, 200)}...</p>
                                        <div className="mt-8 flex flex-col sm:flex-row gap-4">
                                            <button
                                                onClick={handleDownloadPdf}
                                                disabled={isDownloadingPdf || isDownloadingEpub}
                                                className="flex items-center justify-center w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-lg hover:bg-green-700 disabled:bg-gray-500 transition-all duration-300"
                                            >
                                                {isDownloadingPdf ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <DownloadIcon className="w-5 h-5 mr-2" />}
                                                <span className="ml-2">{isDownloadingPdf ? 'Preparing PDF...' : 'Download PDF'}</span>
                                            </button>
                                            <button
                                                onClick={handleDownloadEpub}
                                                disabled={isDownloadingPdf || isDownloadingEpub}
                                                className="flex items-center justify-center w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-lg hover:bg-blue-700 disabled:bg-gray-500 transition-all duration-300"
                                            >
                                                {isDownloadingEpub ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <BookIcon className="w-5 h-5 mr-2" />}
                                                <span className="ml-2">{isDownloadingEpub ? 'Preparing EPUB...' : 'Download EPUB'}</span>
                                            </button>
                                        </div>
                                         <p className="text-sm text-gray-400 mt-3 text-center sm:text-left">EPUB is recommended for Kindle, Apple Books, and other e-readers.</p>
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
