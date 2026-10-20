(function(){
  var sec=document.getElementById('states');
  if(!sec)return;
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Skeleton phone: hold skeleton, load content, replay
  var scr=sec.querySelector('.xs-scr'),rep=sec.querySelector('.xs-replay'),t1;
  if(scr&&rep){
    rep.addEventListener('click',function(){
      clearTimeout(t1);
      if(scr.dataset.xsState==='loaded'){
        scr.dataset.xsState='loading';rep.textContent='Loading';
        t1=setTimeout(function(){scr.dataset.xsState='loaded';rep.textContent='Replay loading';},1600);
      }else{
        rep.textContent='Loading';
        t1=setTimeout(function(){scr.dataset.xsState='loaded';rep.textContent='Replay loading';},reduce?300:900);
      }
    });
  }
  // Inline button spinner sequence
  var b=sec.querySelector('.xs-save'),busy=false;
  if(b){
    b.style.minWidth=b.offsetWidth+'px';
    b.addEventListener('click',function(){
      if(busy)return;busy=true;
      b.setAttribute('aria-busy','true');
      b.innerHTML='<span class="spin" aria-hidden="true"></span>Saving';
      setTimeout(function(){
        b.classList.remove('primary');b.classList.add('xs-done');b.removeAttribute('aria-busy');
        b.innerHTML='<i data-lucide="check"></i>Saved';
        if(window.lucide)lucide.createIcons();
        setTimeout(function(){b.classList.remove('xs-done');b.classList.add('primary');b.textContent='Save match';busy=false;},1200);
      },1400);
    });
  }
})();
