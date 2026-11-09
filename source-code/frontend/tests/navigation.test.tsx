import React,{Suspense,lazy} from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {LiveProvider,useLive} from '../src/app/LiveContext';

afterEach(()=>{cleanup();vi.unstubAllGlobals();sessionStorage.clear();});

describe('screen loading',()=>{
  it('keeps the current screen visible while the destination module loads',async()=>{
    location.hash='261:37926';
    vi.stubGlobal('EventSource',class{addEventListener(){}close(){}});
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(JSON.stringify({data:String(url).endsWith('/auth/me')?{
      ma_nguoi_dung:'11111111-1111-4111-8111-111111111111',ho_ten:'Quản lý',vai_tro:'Quản lý',
    }:[]}))));
    let finishLoading!:(value:{default:React.ComponentType})=>void;
    const destination=lazy(()=>new Promise<{default:React.ComponentType}>(resolve=>{finishLoading=resolve;}));
    function Overview(){
      const live=useLive();
      return <button onClick={()=>live.go('GD2.4-4-1')}>Mở quản lý tài khoản</button>;
    }
    function Outlet(){
      const live=useLive();
      if(!live.ready)return null;
      const View=live.screenId==='261:28400'?destination:Overview;
      return <Suspense fallback={<p>Màn hình trống đang tải</p>}><View/></Suspense>;
    }
    render(<LiveProvider><Outlet/></LiveProvider>);
    const user=userEvent.setup();
    await user.click(await screen.findByRole('button',{name:'Mở quản lý tài khoản'}));
    expect(screen.getByRole('button',{name:'Mở quản lý tài khoản'})).toBeTruthy();
    expect(screen.queryByText('Màn hình trống đang tải')).toBeNull();
    await act(async()=>finishLoading({default:()=> <h1>Quản lý tài khoản đã tải</h1>}));
    expect(await screen.findByText('Quản lý tài khoản đã tải')).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Mở quản lý tài khoản'})).toBeNull();
  });
});
