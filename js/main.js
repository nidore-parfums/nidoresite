// --------------------------------------------------------
// CONFIGURAÃ‡Ã•ES DA LOJA â€” edite apenas estas constantes
// --------------------------------------------------------
const WHATSAPP_NUMBER = '5585988009527'; // nÃºmero com cÃ³digo do paÃ­s, sem + ou espaÃ§os
const PIX_EMAIL_KEY = 'nidore.mail@gmail.com';
const PIX_COPY_NOTE = 'Por favor, enviar comprovante junto com a lista de itens.';


// --------------------------------------------------------
// ESTADO GLOBAL
// --------------------------------------------------------
let products=[],cart=[],activeProduct=null,selectedSize=null,qty=1,activeGender='todos',favorites=new Set();
let isSearchPanelOpen=false;
let isSearchResultsMode=false;

// --------------------------------------------------------
// PARSER DE CSV â€” suporta campos com ví­rgulas entre aspas
// --------------------------------------------------------
function parseCSV(text){
  const delimiter=';';
  const lines=text.trim().split('\n'),headers=lines[0].split(delimiter).map(h=>h.trim());
  return lines.slice(1).map(line=>{
    const values=[];let cur='',inQ=false;
    for(let c of line){if(c==='"'){inQ=!inQ}else if(c===delimiter&&!inQ){values.push(cur.trim());cur=''}else{cur+=c}}
    values.push(cur.trim());
    const obj={};headers.forEach((h,i)=>obj[h]=values[i]||'');return obj;
  });
}

// Remove acentos e normaliza para comparação de texto
function normalizeText(v){return(v||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
function parsePriceValue(v){const n=parseFloat((v??'').toString().replace(',','.'));return Number.isFinite(n)?n:0}

// Converte valor de gênero para padrão interno
function normalizeGender(v){const n=normalizeText(v);if(['feminino','feminina'].includes(n))return'feminino';if(['masculino','masculina'].includes(n))return'masculino';if(['compartilhavel','unissex','unisex'].includes(n))return'compartilhavel';return''}
function isArabicProduct(product){const text=[product?.nome,product?.familia,product?.descricao,product?.genero].map(normalizeText).join(' '),keywords=['arabe','arabes','made in uae','emirados arabes','lattafa','maison alhambra','afnan','al haramain','al wataniah','orientica'];return keywords.some(keyword=>text.includes(keyword))}

// Infere o gênero pelo nome quando não está no CSV
function inferGender(name){const n=normalizeText(name),m={'baccarat rouge 540':'compartilhavel','sauvage elixir':'masculino','la vie est belle':'feminino','black orchid':'compartilhavel','aventus':'masculino','good girl':'feminino','oud wood':'compartilhavel','light blue':'feminino','coco mademoiselle':'feminino','miss dior':'feminino','1 million':'masculino','si':'feminino','ysl libre':'feminino','flowerbomb':'feminino',"l'homme":'masculino'};return m[n]||'compartilhavel'}
function normalizeProduct(p){return{...p,genero:normalizeGender(p.genero)||inferGender(p.nome),arabe:isArabicProduct(p)}}

// --------------------------------------------------------
// FILTROS E RENDERIZAÇÃO
// --------------------------------------------------------

// Ativa o chip de gênero e refaz o grid
function setGenderFilter(v){activeGender=v;document.querySelectorAll('.chip').forEach(b=>b.classList.toggle('active',b.dataset.filter===v));renderGrid()}

// Calcula a posição do painel de busca baseado na altura do header
function updateSearchOffset(){const h=document.querySelector('header');if(h)document.documentElement.style.setProperty('--search-top',`${h.offsetHeight}px`)}

// Mede o painel no mobile para alinhar o botão com o dropdown aberto
function updateSearchPanelMetrics(){
  const shell=document.getElementById('searchShell'),wrap=shell?.querySelector('.search-panel-wrap');
  if(!shell||!wrap)return;
  if(!window.matchMedia('(max-width: 900px)').matches){shell.style.removeProperty('--search-panel-width');return}
  const panelWidth=Math.ceil(wrap.getBoundingClientRect().width||wrap.offsetWidth||0);
  if(panelWidth)shell.style.setProperty('--search-panel-width',`${panelWidth}px`);
}

// Sincroniza o visual do painel com o estado isSearchPanelOpen
function syncSearchPanel(){const s=document.getElementById('searchShell'),t=document.getElementById('searchToggle'),i=document.getElementById('searchToggleIcon');if(!s||!t||!i)return;updateSearchPanelMetrics();s.classList.toggle('open',isSearchPanelOpen);t.setAttribute('aria-expanded',String(isSearchPanelOpen))}
function hasActiveCatalogFilters(){const q=normalizeText(document.getElementById('searchInput')?.value),fam=document.getElementById('familyFilter')?.value||'all',price=document.getElementById('priceFilter')?.value||'all';return Boolean(q)||fam!=='all'||price!=='all'||activeGender!=='todos'}
function syncSearchResultsMode(){document.body.classList.toggle('search-results-mode',isSearchResultsMode)}
function toggleSearchPanel(){isSearchPanelOpen=!isSearchPanelOpen;syncSearchPanel()}
function closeSearchPanelOnOutsideClick(event){const searchShell=document.getElementById('searchShell');if(!isSearchPanelOpen||!searchShell||searchShell.contains(event.target))return;isSearchPanelOpen=false;syncSearchPanel()}
function scrollToCatalogResults(){const scroller=document.getElementById('catalogMain'),grid=document.getElementById('grid');if(!scroller||!grid)return;scroller.scrollTo({top:Math.max(grid.offsetTop-24,0),behavior:'smooth'})}
function scrollToTop(){const scroller=document.getElementById('catalogMain');if(!scroller)return;scroller.scrollTo({top:0,behavior:'smooth'})}
function applySearch(){isSearchResultsMode=hasActiveCatalogFilters();syncSearchResultsMode();renderGrid();if(isSearchPanelOpen){isSearchPanelOpen=false;syncSearchPanel()}if(isSearchResultsMode)scrollToCatalogResults()}

// Converte nome para slug seguro (usado no caminho da imagem)
function slugify(n){if(!n)return'';return n.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/,'')}

// Gera <picture> com WebP + fallback JPG/PNG e lazy loading.
function renderProductImage(p,eager=false){
  const id=(p.foto||p.emoji||'').toString().trim().replace(/^(images|imagens)[\\/]/i,'');
  const hasExt=/\.[a-z0-9]+$/i.test(id);
  const baseId=hasExt?id.replace(/\.[a-z0-9]+$/i,''):id;
  const slugFromPhoto=slugify(baseId);
  const slugFromName=slugify(p.nome);
  const candidates=[
    hasExt?id:'',
    slugFromPhoto?`${slugFromPhoto}.jpg`:'',
    slugFromPhoto?`${slugFromPhoto}.png`:'',
    slugFromPhoto?`${slugFromPhoto}.jpeg`:'',
    slugFromName?`${slugFromName}.jpg`:'',
    slugFromName?`${slugFromName}.png`:'',
    slugFromName?`${slugFromName}.jpeg`:''
  ].filter((value,index,list)=>value&&list.indexOf(value)===index);
  const primaryBase=(candidates[0]||`${slugFromName}.jpg`).replace(/\.[a-z0-9]+$/i,'');
  const imgSrc=candidates[0]||`${slugFromName}.jpg`;
  const fallbackSrc=candidates.slice(1).join('|');
  const fallback=(p.emoji||'🌸').replace(/'/g,"\\'");
  const loading=eager?'eager':'lazy';
  return`<picture><source srcset="imagens/${primaryBase}.webp" type="image/webp"><img src="imagens/${imgSrc}" alt="${p.nome}" loading="${loading}" decoding="async" data-fallback-images="${fallbackSrc}" onerror="const next=(this.dataset.fallbackImages||'').split('|').filter(Boolean);if(next.length){this.src='imagens/'+next.shift();this.dataset.fallbackImages=next.join('|');return;}this.onerror=null;this.style.display='none';this.parentNode.textContent='${fallback}'"></picture>`
}

// Aplica todos os filtros ativos e retorna os produtos filtrados
function getProductPriceData(product,sizeLabel){const regularPrice=parsePriceValue(product?.[`preco_${sizeLabel}`]),discountPrice=parsePriceValue(product?.[`preco_${sizeLabel}_desconto`]),hasDiscount=discountPrice>0&&regularPrice>0&&discountPrice<regularPrice;return{regularPrice,discountPrice:hasDiscount?discountPrice:0,finalPrice:hasDiscount?discountPrice:regularPrice,hasDiscount}}
function getLowestProductPriceData(product){const priceOptions=['2ml','5ml','10ml'].map(sizeLabel=>getProductPriceData(product,sizeLabel)).filter(option=>option.finalPrice>0);if(!priceOptions.length)return{regularPrice:0,discountPrice:0,finalPrice:0,hasDiscount:false};return priceOptions.reduce((lowest,current)=>current.finalPrice<lowest.finalPrice?current:lowest)}
function hasProductDiscount(product){return['2ml','5ml','10ml'].some(sizeLabel=>getProductPriceData(product,sizeLabel).hasDiscount)}
function renderPriceMarkup(currentPrice,originalPrice=0,currentClass='price-current',originalClass='price-original'){const original=originalPrice>currentPrice?`<span class="${originalClass}">R$ ${formatPrice(originalPrice)}</span>`:'';return`${original}<span class="${currentClass}">R$ ${formatPrice(currentPrice)}</span>`}
function getDiscountPercent(priceData){if(!priceData?.hasDiscount||priceData.regularPrice<=0||priceData.finalPrice<=0)return 0;return Math.round((1-(priceData.finalPrice/priceData.regularPrice))*100)}
function matchesActiveGroup(product){if(activeGender==='todos')return true;if(activeGender==='arabes')return Boolean(product.arabe);if(activeGender==='outlet')return hasProductDiscount(product);return product.genero===activeGender}
function getFilteredProducts(){const q=normalizeText(document.getElementById('searchInput').value),fam=document.getElementById('familyFilter').value,price=document.getElementById('priceFilter').value;return products.filter(p=>{const b=getProductPriceData(p,'2ml').finalPrice||0,mq=!q||[p.nome,p.familia,p.descricao,p.genero,p.arabe?'arabes arabe':'',hasProductDiscount(p)?'outlet desconto promocao oferta sale':'' ].some(v=>normalizeText(v).includes(q)),mg=matchesActiveGroup(p),mf=fam==='all'||normalizeText(p.familia)===fam,mp=price==='all'||(price==='ate20'&&b<=20)||(price==='de20a25'&&b>20&&b<=25)||(price==='acima25'&&b>25);return mq&&mg&&mf&&mp})}

function formatPrice(v){return parsePriceValue(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}
function formatCurrency(v){return`R$ ${formatPrice(v)}`}

// FRETE MANUAL â€” o valor final Ã© combinado no atendimento via WhatsApp.
function getCartUnitsCount(){return cart.reduce((s,i)=>s+i.qty,0)}
function getCartSubtotal(){return cart.reduce((s,i)=>s+i.total,0)}
function getPixDiscountAmount(subtotal=getCartSubtotal()){return Number((subtotal*.05).toFixed(2))}
function getOrderTotal(subtotal=getCartSubtotal()){return isPixPaymentSelected()?Number((subtotal-getPixDiscountAmount(subtotal)).toFixed(2)):subtotal}
function normalizeZip(v){return(v||'').replace(/\D/g,'').slice(0,8)}
function isValidZip(v){return normalizeZip(v).length===8}
const FORTALEZA_SHIPPING_FEE=10;
const FREE_SHIPPING_UNITS=5;
function isFreeShipping(){return getCartUnitsCount()>=FREE_SHIPPING_UNITS}
function isFortalezaZip(v){const zip=normalizeZip(v);if(zip.length!==8)return false;const value=Number(zip);return value>=60000001&&value<=61599999}
function getShippingInfo(v=''){if(!isValidZip(v))return{label:'R$ 10,00 em Fortaleza',meta:'Fortaleza: frete fixo de R$ 10,00. - Demais CEPs: frete a calcular no atendimento. - ENVIO EM 24H.',amount:null,isFortaleza:false,hasValidZip:false};if(isFortalezaZip(v))return{label:formatCurrency(FORTALEZA_SHIPPING_FEE),meta:'CEP de Fortaleza identificado. Frete fixo de R$ 10,00. ENVIO EM 24H.',amount:FORTALEZA_SHIPPING_FEE,isFortaleza:true,hasValidZip:true};return{label:'A calcular',meta:'CEP fora de Fortaleza. O frete será calculado no atendimento. ENVIO EM 24H.',amount:null,isFortaleza:false,hasValidZip:true}}
function updateCheckoutShippingSummary(zipValue=''){const valueEl=document.getElementById('checkoutShippingValue'),metaEl=document.getElementById('checkoutShippingMeta');if(!valueEl||!metaEl)return;const shipping=getShippingInfo(zipValue);valueEl.textContent=shipping.label;metaEl.textContent=shipping.meta}

// Formata o CEP enquanto o usuário digita: "60425685" â†’ "60425-685"
function formatZipInput(input){const d=normalizeZip(input.value);input.value=d.length>5?`${d.slice(0,5)}-${d.slice(5)}`:d;updateCheckoutShippingSummary(input.value)}

// --------------------------------------------------------
// FAVORITOS
// --------------------------------------------------------
function loadFavorites(){try{return new Set(JSON.parse(localStorage.getItem('nidoreFavorites')||'[]'))}catch{return new Set()}}
function saveFavorites(){localStorage.setItem('nidoreFavorites',JSON.stringify([...favorites]))}
function updateFavoriteBtn(){
  const btn=document.getElementById('modalFavBtn');
  if(!btn||!activeProduct)return;
  const isFav=favorites.has(activeProduct.nome);
  btn.setAttribute('aria-label',isFav?'Remover dos favoritos':'Adicionar aos favoritos');
  btn.querySelector('.modal-action-label').textContent=isFav?'Favoritado':'Favoritar';
  btn.classList.toggle('is-fav',isFav);
}
function toggleFavorite(){
  if(!activeProduct)return;
  if(favorites.has(activeProduct.nome))favorites.delete(activeProduct.nome);
  else favorites.add(activeProduct.nome);
  saveFavorites();
  updateFavoriteBtn();
  updateCardBadges();
}
async function shareProduct(){
  if(!activeProduct)return;
  const url=window.location.href;
  if(navigator.share){try{await navigator.share({title:activeProduct.nome+' – Nidore Parfums',url});return}catch(e){if(e.name==='AbortError')return}}
  try{await navigator.clipboard.writeText(url);showToast('Link copiado!')}
  catch{showToast('Copie o link da barra de endereços.')}
}

// --------------------------------------------------------
// MODAL DO PRODUTO
// --------------------------------------------------------
function openModal(idx){
  activeProduct=products[idx];selectedSize=null;qty=1;
  document.getElementById('mName').textContent=activeProduct.nome;
  document.getElementById('mFamily').textContent=activeProduct.familia;
  document.getElementById('mDesc').textContent=activeProduct.descricao||'';
  document.getElementById('mMedia').innerHTML=renderProductImage(activeProduct);
  document.getElementById('qtyNum').textContent='1';
  document.getElementById('addCartBtn').disabled=true;
  // Badge de gênero
  const genderLabels={feminino:'Feminino',masculino:'Masculino',compartilhavel:'Compartilhável'};
  const genderEl=document.getElementById('mGender');
  if(genderEl){const g=activeProduct.genero||'';genderEl.textContent=genderLabels[g]||'';genderEl.className='modal-tag modal-gender-tag gender-'+g;genderEl.style.display=g?'inline-block':'none';}
  const sizes=['2ml','5ml','10ml'].map(ml=>({ml,...getProductPriceData(activeProduct,ml)}));
  document.getElementById('sizesGrid').innerHTML=sizes.map((s,i)=>`<div class="size-card" id="sz${i}" onclick="selectSize(${i},'${s.ml}',${s.finalPrice},${s.regularPrice})" role="radio" tabindex="0" aria-checked="false"><div class="size-volume"><span class="size-ml">${s.ml.replace('ml','')}</span><span class="size-unit">ML</span></div><div class="size-price${s.hasDiscount?' has-discount':''}">${renderPriceMarkup(s.finalPrice,s.hasDiscount?s.regularPrice:0,'size-price-current','size-price-original')}</div></div>`).join('');
  document.getElementById('productOverlay').classList.add('active');
  document.body.style.overflow='hidden';
  // Atualiza URL para permitir compartilhamento
  history.replaceState({produto:activeProduct.nome},'',`?p=${slugify(activeProduct.nome)}`);
  updateFavoriteBtn();
}

// Seleciona o tamanho e habilita o botão de adicionar ao carrinho
function selectSize(idx,ml,price,regularPrice){selectedSize={ml,price:parsePriceValue(price),regularPrice:parsePriceValue(regularPrice)||parsePriceValue(price)};document.querySelectorAll('.size-card').forEach((c,i)=>{c.classList.toggle('selected',i===idx);c.setAttribute('aria-checked',i===idx?'true':'false')});document.getElementById('addCartBtn').disabled=false}
function changeQty(delta){qty=Math.max(1,qty+delta);document.getElementById('qtyNum').textContent=qty}
function closeModal(){document.getElementById('productOverlay').classList.remove('active');document.body.style.overflow='';if(window.location.search)history.replaceState({},'',window.location.pathname)}
function handleOverlayClick(e){if(e.target===document.getElementById('productOverlay'))closeModal()}

// --------------------------------------------------------
// CARRINHO
// --------------------------------------------------------

// Anima o produto saindo do modal para o feedback de adição.
function animateItemToCart(){
  const cartFab=document.querySelector('.cart-fab');
  const media=document.getElementById('mMedia');
  if(!cartFab||!media)return;
  const targetRect=cartFab.getBoundingClientRect();
  const sourceRect=media.getBoundingClientRect();
  if(!sourceRect.width||!sourceRect.height||!targetRect.width||!targetRect.height)return;

  const fly=document.createElement('div');
  fly.className='cart-fly-item';
  fly.style.width=`${sourceRect.width}px`;
  fly.style.height=`${sourceRect.height}px`;
  fly.style.transform=`translate3d(${sourceRect.left}px, ${sourceRect.top}px, 0) scale(1)`;
  fly.style.opacity='1';

  const sourceImg=media.querySelector('img');
  if(sourceImg){
    const img=sourceImg.cloneNode(true);
    img.removeAttribute('onerror');
    fly.appendChild(img);
  }else{
    fly.classList.add('is-emoji');
    fly.textContent=(activeProduct?.emoji||'🌸').trim();
  }

  document.body.appendChild(fly);

  const deltaX=(targetRect.left+(targetRect.width/2))-(sourceRect.left+(sourceRect.width/2));
  const deltaY=(targetRect.top+(targetRect.height/2))-(sourceRect.top+(sourceRect.height/2));
  const scale=Math.max(targetRect.width/sourceRect.width,.18);

  requestAnimationFrame(()=>{
    fly.style.transition='transform .62s cubic-bezier(.22,.72,.18,1), opacity .62s ease';
    fly.style.transform=`translate3d(${sourceRect.left+deltaX}px, ${sourceRect.top+deltaY}px, 0) scale(${scale})`;
    fly.style.opacity='.2';
  });

  setTimeout(()=>fly.remove(),700);
}

// Adiciona o item e exibe animação no contador
function addToCart(){if(!selectedSize||!activeProduct)return;animateItemToCart();const item={nome:activeProduct.nome,ml:selectedSize.ml,priceUnit:selectedSize.price,regularPriceUnit:selectedSize.regularPrice,qty,total:selectedSize.price*qty,id:Date.now()+Math.random()};cart.push(item);updateCartUI();closeModal();showToast(`${item.nome} (${item.ml}) adicionado!`);document.querySelectorAll('[data-cart-count]').forEach(cnt=>{cnt.classList.add('bump');setTimeout(()=>cnt.classList.remove('bump'),350)})}
function removeFromCart(id){cart=cart.filter(c=>c.id!==id);updateCartUI()}

// Marca visualmente os cards cujo produto já está no carrinho ou é favorito
function updateCardBadges(){
  const inCart=new Set(cart.map(c=>c.nome));
  const favSvg=`<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  document.querySelectorAll('.card[data-product-name]').forEach(card=>{
    const name=card.dataset.productName;
    card.classList.toggle('in-cart',inCart.has(name));
    let favBadge=card.querySelector('.card-fav-badge');
    if(favorites.has(name)){
      if(!favBadge){favBadge=document.createElement('div');favBadge.className='card-fav-badge';favBadge.setAttribute('aria-label','Favorito');favBadge.innerHTML=favSvg;card.querySelector('.card-img')?.appendChild(favBadge)}
    }else{favBadge?.remove()}
  });
}

// Debounce para evitar re-render a cada tecla na busca
let _searchDebounceTimer=null;
function debouncedRenderGrid(){clearTimeout(_searchDebounceTimer);_searchDebounceTimer=setTimeout(renderGrid,150);}

// Sincroniza o carrinho com subtotal local, desconto Pix e frete informado no atendimento.
function updateCartUI(){const sub=getCartSubtotal(),cartUnits=getCartUnitsCount(),freeShip=isFreeShipping(),pixDiscount=isPixPaymentSelected()?getPixDiscountAmount(sub):0,total=getOrderTotal(sub),shippingPolicy=getShippingInfo();
// Barra de progresso frete grátis
const remaining=Math.max(0,FREE_SHIPPING_UNITS-cartUnits),pct=Math.min(100,(cartUnits/FREE_SHIPPING_UNITS)*100);
const labelEl=document.getElementById('freeShippingLabel'),barEl=document.getElementById('freeShippingBar'),trackEl=document.getElementById('freeShippingTrack');
if(labelEl){labelEl.textContent=freeShip?'FRETE GRÁTIS DESBLOQUEADO! 🎉':`Faltam ${remaining} decant${remaining!==1?'s':''} para frete grátis`;labelEl.classList.toggle('is-free',freeShip)}
if(barEl){barEl.style.width=`${pct}%`;barEl.classList.toggle('is-free',freeShip)}
if(trackEl)trackEl.setAttribute('aria-valuenow',String(cartUnits));
// Exibição do frete
const shippingLabel=freeShip?'Grátis':shippingPolicy.label;
const shippingNote=freeShip?'ENVIO EM 24H.':(pixDiscount>0?`Desconto Pix aplicado: ${formatCurrency(pixDiscount)}. ${shippingPolicy.meta}`:shippingPolicy.meta);
document.querySelectorAll('[data-cart-count]').forEach(el=>el.textContent=cartUnits);document.getElementById('cartSubtotal').textContent=formatCurrency(sub);document.getElementById('cartShipping').textContent=shippingLabel;document.getElementById('cartTotal').textContent=formatCurrency(total);document.getElementById('cartShippingNote').textContent=shippingNote;document.getElementById('whatsappBtn').disabled=cart.length===0;
// FAB sempre visível quando há itens no carrinho
const cartFab=document.querySelector('.cart-fab');const _show=cart.length>0||(cartFab?.classList.contains('is-visible')??false);if(cartFab)cartFab.classList.toggle('is-visible',_show);document.querySelectorAll('.whatsapp-fab,.instagram-fab').forEach(f=>f.classList.toggle('is-visible',_show));
// Atualiza badge nos cards do grid
updateCardBadges();
const el=document.getElementById('cartItems');if(!cart.length){el.innerHTML='<div class="cart-empty">Seu carrinho est\u00e1 vazio.</div>';return}el.innerHTML=cart.map(c=>`<div class="cart-item"><div class="ci-info"><div class="ci-name">${c.nome}</div><div class="ci-detail">${c.ml} x ${c.qty}</div></div><div class="ci-right"><div class="ci-price">R$ ${formatPrice(c.total)}</div><button class="ci-remove" onclick="removeFromCart(${c.id})" aria-label="Remover ${c.nome}">remover</button></div></div>`).join('')}
function openCart(){document.getElementById('cartSidebar').classList.add('open');document.getElementById('cartOverlay').classList.add('active');document.body.style.overflow='hidden'}
function closeCart(){document.getElementById('cartSidebar').classList.remove('open');document.getElementById('cartOverlay').classList.remove('active');document.body.style.overflow=''}

// CHECKOUT
function openCheckout(){if(!cart.length)return;document.getElementById('checkoutOverlay').classList.add('active');updateCheckoutShippingSummary(document.getElementById('customerZip')?.value||'');syncCardFollowup()}
function closeCheckout(){document.getElementById('checkoutOverlay').classList.remove('active')}
function handleCheckoutOverlayClick(e){if(e.target===document.getElementById('checkoutOverlay'))closeCheckout()}

// Formata o CPF enquanto digita: "12345678901" â†’ "123.456.789-01"
function formatCpfInput(input){
  const d=input.value.replace(/\D/g,'').slice(0,11);const p=[];if(d.length>0)p.push(d.slice(0,3));if(d.length>3)p.push(d.slice(3,6));if(d.length>6)p.push(d.slice(6,9));let f=p.join('.');if(d.length>9)f+=`-${d.slice(9,11)}`;input.value=f}

// Valida o CPF pelo algoritmo dos dois dÃ­gitos verificadores
function isValidCpf(value){const cpf=value.replace(/\D/g,'');if(cpf.length!==11||/^(\d)\1+$/.test(cpf))return false;let s=0;for(let i=0;i<9;i++)s+=parseInt(cpf[i])*(10-i);let d1=(s*10)%11;if(d1===10)d1=0;if(d1!==parseInt(cpf[9]))return false;s=0;for(let i=0;i<10;i++)s+=parseInt(cpf[i])*(11-i);let d2=(s*10)%11;if(d2===10)d2=0;return d2===parseInt(cpf[10])}
function getSelectedPaymentMethod(){const s=document.querySelector('input[name="paymentMethod"]:checked');return s?s.value:''}
function isCardPaymentSelected(){return/cart/i.test(getSelectedPaymentMethod())}
function isPixPaymentSelected(){return/pix/i.test(getSelectedPaymentMethod())}
function getSelectedCardNubank(){const s=document.querySelector('input[name="cardNubank"]:checked');return s?s.value:''}

// Mostra/oculta a pergunta sobre Nubank e aplica o desconto quando Pix estiver selecionado.
function syncCardFollowup(){const cardFollowup=document.getElementById('cardFollowup'),pixFollowup=document.getElementById('pixFollowup'),pixCopyNote=document.getElementById('pixCopyNote'),pixCopyBtn=document.getElementById('pixCopyBtn'),pixKeyValue=document.getElementById('pixKeyValue');if(pixKeyValue)pixKeyValue.textContent=PIX_EMAIL_KEY;const showCard=isCardPaymentSelected(),showPix=isPixPaymentSelected();if(cardFollowup){cardFollowup.classList.toggle('active',showCard);if(!showCard)document.querySelectorAll('input[name="cardNubank"]').forEach(i=>i.checked=false)}if(pixFollowup)pixFollowup.classList.toggle('active',showPix);if(pixCopyNote){if(showPix){pixCopyNote.textContent='Pagamento via Pix garante 5% de desconto sobre os decants. Envie o comprovante junto com a lista de itens.';pixCopyNote.classList.add('show')}else{pixCopyNote.textContent=PIX_COPY_NOTE;pixCopyNote.classList.remove('show')}}if(pixCopyBtn){pixCopyBtn.textContent='Copiar chave';pixCopyBtn.classList.remove('copied')}updateCartUI()}
async function copyPixKey(){const pixCopyNote=document.getElementById('pixCopyNote'),pixCopyBtn=document.getElementById('pixCopyBtn');try{await navigator.clipboard.writeText(PIX_EMAIL_KEY);if(pixCopyBtn){pixCopyBtn.textContent='Copiado';pixCopyBtn.classList.add('copied')}if(pixCopyNote){pixCopyNote.textContent=PIX_COPY_NOTE;pixCopyNote.classList.add('show')}}catch{showToast('Não foi possível copiar. Use a chave: '+PIX_EMAIL_KEY)}}
document.querySelectorAll('input[name="paymentMethod"]').forEach(i=>i.addEventListener('change',syncCardFollowup));

// --------------------------------------------------------
// PLANILHA DE CLIENTES â€” salva no localStorage e exporta CSV
// --------------------------------------------------------
const CUSTOMER_SHEET_STORAGE_KEY='nidoreCustomerSheet',CUSTOMER_SHEET_FILENAME='clientes_pedidos.csv';
function getOrderDateLabel(){return new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
function escapeCsvValue(v){const t=(v||'').toString().replace(/"/g,'""');return/[";\n]/.test(t)?`"${t}"`:t}
function loadCustomerSheet(){try{const s=localStorage.getItem(CUSTOMER_SHEET_STORAGE_KEY);const p=s?JSON.parse(s):[];return Array.isArray(p)?p:[]}catch{return[]}}
function saveCustomerSheet(records){localStorage.setItem(CUSTOMER_SHEET_STORAGE_KEY,JSON.stringify(records))}
function buildCustomerSheetCsv(records){const h=['nome_completo','endereco','cpf','data_ultimo_pedido'];return[h,...records.map(r=>[r.nome_completo,r.endereco,r.cpf,r.data_ultimo_pedido])].map(row=>row.map(escapeCsvValue).join(';')).join('\n')}
function downloadCustomerSheet(records){const csv=buildCustomerSheetCsv(records);const blob=new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=CUSTOMER_SHEET_FILENAME;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}

// Adiciona ou atualiza cliente na planilha (identifica pelo CPF)
function registerCustomerOrder(customer){const records=loadCustomerSheet();const cpfClean=(customer.cpf||'').replace(/\D/g,'');const idx=records.findIndex(r=>(r.cpf||'').replace(/\D/g,'')=== cpfClean);if(idx>=0)records[idx]=customer;else records.push(customer);records.sort((a,b)=>a.nome_completo.localeCompare(b.nome_completo,'pt-BR'));saveCustomerSheet(records);return records}

// --------------------------------------------------------
// WHATSAPP â€” monta mensagem e abre o chat
// --------------------------------------------------------
function sendWhatsApp(){openCheckout()} // botão do carrinho abre o checkout primeiro

async function submitCheckout(event){
  event.preventDefault();
  if(!cart.length)return;
  const ni=document.getElementById('customerName'),ci=document.getElementById('customerCpf'),ei=document.getElementById('customerEmail'),zi=document.getElementById('customerZip'),ai=document.getElementById('customerAddress');

  // Validacao
  const form=document.getElementById('checkoutForm');
  if(!form.checkValidity()){form.reportValidity();return}
  if(!isValidCpf(ci.value)){showToast('Informe um CPF valido para continuar.');ci.focus();return}
  if(!isValidZip(zi.value)){showToast('Informe um CEP valido para continuar.');zi.focus();return}
  const pm=getSelectedPaymentMethod(),cn=getSelectedCardNubank();
  if(isCardPaymentSelected()&&!cn){showToast('Informe se o cartao e Nubank para continuar.');return}

  // Monta a mensagem com frete fixo para Fortaleza e frete a calcular para os demais CEPs.
  const freeShip=isFreeShipping(),baseShipping=getShippingInfo(zi.value),sub=getCartSubtotal(),pixDiscount=isPixPaymentSelected()?getPixDiscountAmount(sub):0,total=getOrderTotal(sub);
  const shipping=freeShip?{label:'Grátis',amount:0,meta:'Frete grátis (5+ decants)'}:baseShipping;
  const totalWithShipping=shipping.amount===null?null:Number((total+shipping.amount).toFixed(2));
  let msg=`*Nidore Parfums - Pedido*\n\n*Nome:* ${ni.value.trim()}\n*CPF:* ${ci.value.trim()}\n*Email:* ${ei.value.trim()}\n*CEP:* ${zi.value.trim()}\n*Endereco:* ${ai.value.trim()}\n*Pagamento:* ${pm}\n`;
  if(isCardPaymentSelected())msg+=`*Cartao Nubank:* ${cn}\n`;
  msg+=`\n*Itens:*\n`;
  cart.forEach(c=>{msg+=`- ${c.nome} (${c.ml}) x${c.qty} - R$ ${formatPrice(c.total)}\n`});
  msg+=`\n*Subtotal:* R$ ${formatPrice(sub)}\n`;
  if(pixDiscount>0)msg+=`*Desconto Pix (5%):* - R$ ${formatPrice(pixDiscount)}\n`;
  if(freeShip)msg+=`*Frete:* Grátis (pedido com ${getCartUnitsCount()} decants)\n*Total:* R$ ${formatPrice(total)}\n* Ola! Gostaria de finalizar este pedido com frete grátis.`;
  else if(shipping.amount!==null)msg+=`*Frete (Fortaleza):* R$ ${formatPrice(shipping.amount)}\n*Total com frete:* R$ ${formatPrice(totalWithShipping)}\n* Ola! Gostaria de finalizar este pedido para Fortaleza.`;
  else msg+=`*Frete:* A calcular\n*Total parcial:* R$ ${formatPrice(total)}\n* Ola! Gostaria de finalizar este pedido e receber o calculo do frete para este CEP.`;

  // Abre o WhatsApp em nova aba
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`,'_blank');

  // Salva cliente e faz download da planilha
  const sheet=registerCustomerOrder({nome_completo:ni.value.trim(),endereco:`${ai.value.trim()} | CEP: ${zi.value.trim()}`,cpf:ci.value.trim(),data_ultimo_pedido:getOrderDateLabel()});
  downloadCustomerSheet(sheet);

  // Reseta tudo e fecha os modais
  form.reset();updateCheckoutShippingSummary();syncCardFollowup();closeCheckout();closeCart();
  showToast('Pedido enviado com sucesso!');
}

// --------------------------------------------------------
// TOAST â€” notificaÇo temporaria na base da tela
// --------------------------------------------------------
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800)}

// --------------------------------------------------------
// INICIALIZAÇÂO/ carrega CSV e monta a loja
// --------------------------------------------------------
function getProductsMatchingNonFamilyFilters(){const q=normalizeText(document.getElementById('searchInput').value),price=document.getElementById('priceFilter').value;return products.filter(p=>{const b=getProductPriceData(p,'2ml').finalPrice||0,mq=!q||[p.nome,p.familia,p.descricao,p.genero,p.arabe?'arabes arabe':'',hasProductDiscount(p)?'outlet desconto promocao oferta sale':'' ].some(v=>normalizeText(v).includes(q)),mg=matchesActiveGroup(p),mp=price==='all'||(price==='ate20'&&b<=20)||(price==='de20a25'&&b>20&&b<=25)||(price==='acima25'&&b>25);return mq&&mg&&mp})}
function updateFamilyFilterAvailability(){const el=document.getElementById('familyFilter');if(!el)return;const activeFamilies=new Set(getProductsMatchingNonFamilyFilters().map(p=>normalizeText(p.familia)).filter(Boolean));const selectedStillAvailable=el.value==='all'||activeFamilies.has(el.value);[...el.options].forEach(option=>{if(option.value==='all'){option.disabled=false;return}option.disabled=!activeFamilies.has(option.value)});if(!selectedStillAvailable)el.value='all'}
// Mantém o select coerente com os filtros ativos sem esconder famílias válidas.
function populateFamilyFilter(){const el=document.getElementById('familyFilter'),f=[...new Set(products.map(p=>(p.familia||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));el.innerHTML=['<option value="all">Todas as famílias</option>',...f.map(x=>`<option value="${normalizeText(x)}">${x}</option>`)].join('');updateFamilyFilterAvailability()}
// Render central do catálogo: qualquer mudança em busca/filtros deve passar por aqui.
function renderGrid(){updateFamilyFilterAvailability();const filtered=getFilteredProducts();document.getElementById('resultsMeta').textContent=`${filtered.length} ${filtered.length===1?'fragr\u00e2ncia encontrada':'fragr\u00e2ncias encontradas'}`;const grid=document.getElementById('grid');if(!hasActiveCatalogFilters()&&isSearchResultsMode){isSearchResultsMode=false;syncSearchResultsMode()}if(!filtered.length){grid.innerHTML='<div class="no-products">Nenhum perfume encontrado com esses filtros.</div>';return}const inCart=new Set(cart.map(c=>c.nome));grid.innerHTML=filtered.map((p,i)=>{const startingPrice=getLowestProductPriceData(p),discountPercent=getDiscountPercent(startingPrice),isInCart=inCart.has(p.nome);return`<div class="card${isInCart?' in-cart':''}" data-product-name="${p.nome.replace(/"/g,'&quot;')}" onclick="openModal(${products.indexOf(p)})" style="animation-delay:${i*.04}s" role="button" tabindex="0"><div class="card-img">${renderProductImage(p)}${discountPercent?`<div class="card-discount-badge" aria-label="${discountPercent}% off">${discountPercent}% OFF</div>`:''}${isInCart?`<div class="card-in-cart-badge${discountPercent?' has-discount-badge':''}" aria-label="No carrinho">✓</div>`:''}</div><div class="card-body"><div class="card-name">${p.nome}</div><div class="card-family">${p.familia}</div><div class="card-footer"><span class="card-price${startingPrice.hasDiscount?' has-discount':''}">a partir de ${renderPriceMarkup(startingPrice.finalPrice,startingPrice.hasDiscount?startingPrice.regularPrice:0,'card-price-current','card-price-original')}</span><button class="card-cta" tabindex="-1">Ver tamanhos</button></div></div></div>`}).join('')}

// O hero usa o scroll do `main`, não o da janela, por isso o cálculo parte do catálogo.
function initHeroScroll(){
  const scroller = document.querySelector('main');
  const hero = document.getElementById('heroDecant');
  const bottle = document.getElementById('heroBottle');
  const cartFab = document.querySelector('.cart-fab');
  const backToTopBtn = document.getElementById('backToTopBtn');

  if(!scroller || !hero || !bottle) return;

  let rafId = null;

  function clamp01(value){
    return Math.min(Math.max(value, 0), 1);
  }

  function updateHero(){
    rafId = null;

    const maxScroll = Math.max(hero.offsetHeight - scroller.clientHeight, 1);
    const progress = clamp01((scroller.scrollTop - hero.offsetTop) / maxScroll);
    const collectionProgress = clamp01((progress - 0.5) / 0.5);

    hero.style.setProperty('--hero-progress', progress.toFixed(3));
    document.documentElement.style.setProperty('--collection-progress', collectionProgress.toFixed(3));

    const translateY = -10 * progress;
    const scale = 1 + (0.38 * progress);
    const rotate = 7 * progress;

    bottle.style.transform =
      `translate3d(0, ${translateY}px, 0) scale(${scale}) rotate(${rotate}deg)`;

    hero.classList.toggle('is-overlapping', progress >= 0.42);
    // FAB visível pelo scroll OU se o carrinho já tem itens
    const showFabs=progress>=0.5||cart.length>0;
    if(cartFab)cartFab.classList.toggle('is-visible',showFabs);
    document.querySelectorAll('.whatsapp-fab,.instagram-fab').forEach(f=>f.classList.toggle('is-visible',showFabs));
    if(backToTopBtn){
      const grid=document.getElementById('grid');
      const cards=grid?[...grid.querySelectorAll('.card')]:[];
      const targetIndex=Math.min(14,cards.length-1);
      const targetCard=targetIndex>=0?cards[targetIndex]:null;
      const fallbackThreshold=hero.offsetHeight*0.55;
      const rowThreshold=targetCard?Math.max(targetCard.offsetTop-(cards[0]?.offsetTop||0),0):0;
      const productThreshold=cards.length?Math.max(rowThreshold,fallbackThreshold):fallbackThreshold;
      const showBackToTop = scroller.scrollTop >= productThreshold;
      backToTopBtn.classList.toggle('is-visible', showBackToTop);
    }

    const grid=document.getElementById('grid');
    const cards=grid?[...grid.querySelectorAll('.card')]:[];
    const scrollbarTargetIndex=Math.min(6,cards.length-1);
    const scrollbarTargetCard=scrollbarTargetIndex>=0?cards[scrollbarTargetIndex]:null;
    const scrollbarThreshold=scrollbarTargetCard?Math.max(scrollbarTargetCard.offsetTop-(cards[0]?.offsetTop||0),0):Number.POSITIVE_INFINITY;
    scroller.classList.toggle('show-discreet-scrollbar', scroller.scrollTop >= scrollbarThreshold);

    const step = progress < 0.5 ? '1' : '2';

    hero.dataset.step = step;
  }

  function requestUpdate(){
    if(rafId !== null) return;
    rafId = requestAnimationFrame(updateHero);
  }

  scroller.addEventListener('scroll', requestUpdate, { passive:true });
  window.addEventListener('resize', requestUpdate);

  requestUpdate();
}

// arraste vertical da loja
function initDragScroll(){
  const scroller = document.querySelector('main');
  if(!scroller) return;

  const interactiveSelector = 'button,input,select,textarea,label,a,summary,[role="button"],[contenteditable="true"],[data-no-drag-scroll],.modal,.cart-sidebar,.search-shell';
  const dragSurface = document.body;
  let isPointerDown = false;
  let isDragging = false;
  let pointerId = null;
  let startY = 0;
  let startScrollTop = 0;
  let suppressClickUntil = 0;

  dragSurface.addEventListener('pointerdown', event => {
    if(event.pointerType === 'mouse' && event.button !== 0) return;
    if(event.target.closest(interactiveSelector)) return;

    isPointerDown = true;
    isDragging = false;
    pointerId = event.pointerId;
    startY = event.clientY;
    startScrollTop = scroller.scrollTop;

    dragSurface.setPointerCapture(pointerId);
  });

  dragSurface.addEventListener('pointermove', event => {
    if(!isPointerDown || event.pointerId !== pointerId) return;

    const deltaY = event.clientY - startY;

    if(!isDragging && Math.abs(deltaY) > 6){
      isDragging = true;
      scroller.classList.add('dragging');
    }

    if(!isDragging) return;

    scroller.scrollTop = startScrollTop - deltaY;
    event.preventDefault();
  });

  function endDrag(event){
    if(event.pointerId !== pointerId) return;

    if(isDragging){
      suppressClickUntil = Date.now() + 220;
    }

    isPointerDown = false;
    isDragging = false;
    pointerId = null;
    scroller.classList.remove('dragging');
  }

  dragSurface.addEventListener('pointerup', endDrag);
  dragSurface.addEventListener('pointercancel', endDrag);

  dragSurface.addEventListener('click', event => {
    if(Date.now() < suppressClickUntil){
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}

function initKeyboardScroll(){
  const scroller = document.querySelector('main');
  if(!scroller) return;

  const lineStep = 90;

  document.addEventListener('keydown', event => {
    if(event.defaultPrevented) return;
    const target = event.target;
    if(target instanceof HTMLElement && target.closest('input,textarea,select,[contenteditable="true"],.modal,.cart-sidebar,.search-shell')) return;

    const maxScrollTop = Math.max(scroller.scrollHeight - scroller.clientHeight, 0);
    const pageStep = Math.max(scroller.clientHeight * 0.88, lineStep * 4);
    let nextScrollTop = null;

    switch(event.key){
      case 'ArrowDown':
        nextScrollTop = scroller.scrollTop + lineStep;
        break;
      case 'ArrowUp':
        nextScrollTop = scroller.scrollTop - lineStep;
        break;
      case 'PageDown':
      case ' ':
        if(event.shiftKey){
          nextScrollTop = scroller.scrollTop - pageStep;
        }else{
          nextScrollTop = scroller.scrollTop + pageStep;
        }
        break;
      case 'PageUp':
        nextScrollTop = scroller.scrollTop - pageStep;
        break;
      case 'Home':
        nextScrollTop = 0;
        break;
      case 'End':
        nextScrollTop = maxScrollTop;
        break;
      default:
        return;
    }

    event.preventDefault();
    scroller.scrollTo({
      top:Math.min(Math.max(nextScrollTop,0),maxScrollTop),
      behavior:'smooth'
    });
  });
}

async function init(){
  favorites=loadFavorites();
  try{
    // Tenta carregar o arquivo externo produtos.csv
    const resp=await fetch('produtos.csv');
    if(resp.ok){const text=await resp.text();products=parseCSV(text).map(normalizeProduct)}
    else throw new Error('produtos.csv não encontrado');
  }catch{
    products=[];
    document.getElementById('grid').innerHTML='<div class="no-products">Não foi possível carregar os produtos. Tente recarregar a página.</div>';
  }
  populateFamilyFilter();
  updateSearchOffset(); // calcula posiÇo do painel de busca
  syncSearchPanel();    // sincroniza o estado visual
  renderGrid();         // renderiza os cards de produtos
  updateCartUI();       // inicializa o carrinho (vazio)
  updateCheckoutShippingSummary();
  initHeroScroll();     // inicia o efeito de scroll do hero
  initDragScroll();     // ativa scroll por arraste
  initKeyboardScroll(); // ativa scroll por teclado
  // Abre produto via link compartilhado (?p=slug)
  const _pSlug=new URLSearchParams(window.location.search).get('p');
  if(_pSlug){const _idx=products.findIndex(p=>slugify(p.nome)===_pSlug);if(_idx>=0)openModal(_idx)}
}

// Recalcula posição do painel ao carregar e redimensionar
window.addEventListener('load',updateSearchOffset);
window.addEventListener('load',updateSearchPanelMetrics);
window.addEventListener('resize',()=>{updateSearchOffset();updateSearchPanelMetrics();syncSearchPanel()});
document.addEventListener('pointerdown',closeSearchPanelOnOutsideClick);
window.addEventListener('popstate',()=>{const o=document.getElementById('productOverlay');if(o&&o.classList.contains('active')){o.classList.remove('active');document.body.style.overflow=''}});
init();
