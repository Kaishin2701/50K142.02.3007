import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from './errors.js';
export function renderPdf(draw:(doc:PDFKit.PDFDocument)=>void,fontPath?:string):Promise<Buffer>{
 const bundled=fileURLToPath(new URL('../../assets/fonts/PlusJakartaSans.ttf',import.meta.url));
 const font=fontPath||(existsSync(bundled)?bundled:process.platform==='win32'?join(process.env.WINDIR??'C:/Windows','Fonts/arial.ttf'):undefined);
 check(font&&existsSync(font),'Cần cấu hình PDF_FONT_PATH tới font Unicode TTF/OTF để xuất PDF tiếng Việt.','PDF_FONT_NOT_CONFIGURED',503);
 return new Promise((resolve,reject)=>{
   const doc=new PDFDocument({size:'A4',margin:48});const chunks:Buffer[]=[];
   doc.on('data',(chunk:Buffer)=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
   try{doc.font(font);draw(doc);doc.end();}catch(error){reject(error);doc.destroy();}
 });
}
