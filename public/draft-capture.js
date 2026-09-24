// Keep draft calibration in game coordinates when a recorded mirroring window
// has black margins and a title bar. Fullscreen captures pass through unchanged.
window.DraftCapture={normalize(frame){
 const w=frame.width,h=frame.height,c=frame.getContext('2d',{willReadFrequently:true}),p=c.getImageData(0,0,w,h).data;
 const lit=(x,y)=>{const i=(Math.floor(y)*w+Math.floor(x))*4;return Math.max(p[i],p[i+1],p[i+2])>10;};
 const column=x=>{let n=0,total=0;for(let y=h*.2;y<h*.8;y+=8){total++;if(lit(x,y))n++;}return n/total>.04;};
 let left=0,right=w-1;
 while(left<w*.2&&!column(left))left++;
 while(right>w*.8&&!column(right))right--;
 const width=right-left+1;
 if(width<w*.7||w-width<20)return frame;
 const row=y=>{let n=0,total=0;for(let x=left+width*.1;x<right-width*.1;x+=8){total++;if(lit(x,y))n++;}return n/total>.4;};
 let bottom=h-1;while(bottom>h*.7&&!row(bottom))bottom--;
 const height=Math.round(width*9/16),top=bottom-height+1;
 if(top<0||top>h*.2)return frame;
 const out=document.createElement('canvas');out.width=1920;out.height=1080;
 out.getContext('2d').drawImage(frame,left,top,width,height,0,0,1920,1080);
 return out;
}};
