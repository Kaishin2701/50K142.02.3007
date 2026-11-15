import { httpGateway,sepayGateway,type Gateway,type QrMode } from '../modules/payments/payments.service.js';

export type PaymentEnvironment = {
 QR_PROVIDER?:string;
 QR_GATEWAY_URL?:string;
 QR_GATEWAY_TOKEN?:string;
 SEPAY_BANK?:string;
 SEPAY_ACCOUNT_NUMBER?:string;
 SEPAY_ACCOUNT_NAME?:string;
 SEPAY_WEBHOOK_API_KEY?:string;
};

const simulatedQrGateway: Gateway = {
  async create({ orderCode, amount }) {
    const amountText = new Intl.NumberFormat('vi-VN').format(amount);
    return {
      qrContent: [
        'Mê Cà Phê — QR mô phỏng',
        `Mã đơn: ${orderCode}`,
        `Số tiền: ${amountText} VND`,
        'Không chuyển tiền',
      ].join('\n'),
    };
  },
};

export function paymentConfiguration(env:PaymentEnvironment):{gateway:Gateway;vietQrGateway:Gateway;qrMode:Exclude<QrMode,'demo'>;demoQr:boolean;sepay?:{secret:string;account:string}}{
 const vietQrDemo=env.QR_PROVIDER==='demo-vietqr';
 const demoQr=env.QR_PROVIDER==='demo'||vietQrDemo;
 const qrMode=env.QR_PROVIDER==='sepay'||env.QR_PROVIDER==='http'?'live':'disabled';
 const vietQrGateway=sepayGateway(env.SEPAY_BANK,env.SEPAY_ACCOUNT_NUMBER,env.SEPAY_ACCOUNT_NAME);
 const gateway=vietQrDemo||env.QR_PROVIDER==='sepay'
  ?vietQrGateway
  :demoQr
    ?simulatedQrGateway
    :httpGateway(env.QR_PROVIDER==='http'?env.QR_GATEWAY_URL:undefined,env.QR_PROVIDER==='http'?env.QR_GATEWAY_TOKEN:undefined);
 const sepay=env.QR_PROVIDER==='sepay'&&env.SEPAY_WEBHOOK_API_KEY&&env.SEPAY_ACCOUNT_NUMBER
  ?{secret:env.SEPAY_WEBHOOK_API_KEY,account:env.SEPAY_ACCOUNT_NUMBER}
  :undefined;
 return {gateway,vietQrGateway,qrMode,demoQr,sepay};
}
