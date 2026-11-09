import { z } from 'zod';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from '../../shared/database.js';
import { check } from '../../shared/errors.js';
import { date } from '../../shared/validation.js';
import { reportsRepository as repo } from './reports.repository.js';
import { renderPdf } from '../../shared/pdf.js';
export const revenueQuery=z.object({period:z.enum(['day','month','year']).default('day'),date,
 method:z.enum(['Tiền mặt','Chuyển khoản qua QR']).optional()}).strict();
export function reportsService(db:Database,fontPath?:string){
 const revenue=async(v:z.infer<typeof revenueQuery>)=>{
   const items=await repo.revenue(db,v);const sum=(key:string,method?:string)=>items.filter(r=>!method||r.phuong_thuc===method).reduce((n,r)=>n+BigInt(r[key]),0n).toString();
   const total=sum('doanh_thu'),closed=sum('doanh_thu_da_chot');
   return{period:v.period,date:v.date,method:v.method??null,doanh_thu:total,so_ly:sum('so_ly'),doanh_thu_da_chot:closed,
     doanh_thu_chua_chot:(BigInt(total)-BigInt(closed)).toString(),tien_mat:sum('doanh_thu','Tiền mặt'),chuyen_khoan:sum('doanh_thu','Chuyển khoản qua QR'),items};
 };
 return{
  revenue,
  export:async(v:z.infer<typeof revenueQuery>,format:'xlsx'|'pdf')=>{
    const result=await revenue(v);check(result.items.length>0,'Không có dữ liệu trong khoảng thời gian đã chọn để xuất file.','NO_REPORT_DATA',422);
    const records=[['Khoảng thời gian',`${v.period}: ${v.date}`],['Tổng doanh thu',result.doanh_thu],['Số ly bán ra',result.so_ly],['Tiền mặt',result.tien_mat],['Chuyển khoản',result.chuyen_khoan],['Doanh thu đã chốt',result.doanh_thu_da_chot]];
    if(format==='xlsx'){
      const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Doanh thu');sheet.columns=[{width:30},{width:35}];
      sheet.addRow(['Mê Cà Phê — Báo cáo doanh thu']);sheet.getRow(1).font={bold:true,size:16};
      for(const row of records)sheet.addRow(row);sheet.addRow([]);sheet.addRow(['Ngày','Phương thức','Doanh thu','Số ly']);
      for(const row of result.items)sheet.addRow([row.ngay,row.phuong_thuc,row.doanh_thu,row.so_ly]);
      sheet.getColumn(3).width=25;sheet.getColumn(4).width=16;
      return Buffer.from(await book.xlsx.writeBuffer());
    }
    return renderPdf(doc=>{
        doc.fontSize(20).text('Mê Cà Phê');doc.fontSize(16).text('Báo cáo doanh thu');doc.moveDown();
        for(const [label,value] of records)doc.fontSize(11).text(`${label}: ${value}`);
        doc.moveDown();doc.fontSize(11).text('Chi tiết theo ngày và phương thức thanh toán');
        for(const item of result.items)doc.fontSize(10).text(`${item.ngay} | ${item.phuong_thuc} | ${new Intl.NumberFormat('vi-VN').format(BigInt(item.doanh_thu))} đ | ${item.so_ly} ly`);
    },fontPath);
  },
 };
}
