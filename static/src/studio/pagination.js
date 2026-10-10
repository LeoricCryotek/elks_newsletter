/* Publisher-style measured flow. Mutates structured pages, never PDF-only CSS. */
(function () {
    'use strict';
    const copy = value => structuredClone(value);
    const uid = () => [...crypto.getRandomValues(new Uint32Array(4))].map(n=>n.toString(16).padStart(8,'0')).join('');
    function textCuts(html) {
        const root = document.createElement('div'); root.innerHTML = html;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const cuts = [];
        let node;
        while ((node = walker.nextNode())) {
            for (const match of node.textContent.matchAll(/\S+\s*/g)) cuts.push({node,offset:match.index+match[0].length});
        }
        return {root,cuts};
    }
    function splitText(root, cut) {
        const before = document.createRange(); before.selectNodeContents(root); before.setEnd(cut.node,cut.offset);
        const after = document.createRange(); after.selectNodeContents(root); after.setStart(cut.node,cut.offset);
        const left = document.createElement('div'), right = document.createElement('div');
        left.append(before.cloneContents()); right.append(after.cloneContents());
        return [left.innerHTML,right.innerHTML];
    }
    function joinHtml(parts) {
        const root=document.createElement('div');root.innerHTML=parts[0] || '';
        function merge(left,right) {
            if(left?.nodeType===Node.TEXT_NODE && right?.nodeType===Node.TEXT_NODE){left.textContent+=right.textContent;return true;}
            if(left?.nodeType!==Node.ELEMENT_NODE || right?.nodeType!==Node.ELEMENT_NODE || left.tagName!==right.tagName || left.getAttributeNames().length!==right.getAttributeNames().length || left.getAttributeNames().some(name=>left.getAttribute(name)!==right.getAttribute(name)))return false;
            if(merge(left.lastChild,right.firstChild))right.firstChild.remove();
            while(right.firstChild)left.append(right.firstChild);
            return true;
        }
        for(const html of parts.slice(1)) {
            const next=document.createElement('div');next.innerHTML=html;
            if(merge(root.lastChild,next.firstChild))next.firstChild.remove();
            while(next.firstChild)root.append(next.firstChild);
        }
        return root.innerHTML;
    }
    function storyBlocks(blocks) {
        const output = [];
        for (let i=0;i<blocks.length;i++) {
            const block = copy(blocks[i]);
            if (block.flowGroup) {
                const parts = [block];
                while (i+1<blocks.length && blocks[i+1].flowGroup===block.flowGroup) parts.push(blocks[++i]);
                if (parts.length>1) {
                    delete block.reserveContinuation;
                    if (block.kind==='dynamic') delete block.flowRange;
                    else block.html = joinHtml(parts.map(part=>part.html || ''));
                    block.continuation=false;
                }
            }
            output.push(block);
        }
        return output;
    }
    function split(block, fits) {
        if (block.keepTogether) return null;
        let total, start=0, make;
        if (block.kind==='dynamic' && ['events','upcoming_events'].includes(block.source)) {
            const count = window.ElksPaperRenderer.flowRows(block).length;
            start = block.flowRange?.[0] || 0;
            total = Math.min(block.flowRange?.[1] ?? count,count)-start;
            make = n => [{...block,flowRange:[start,start+n]}, {...block,flowRange:[start+n,block.flowRange?.[1] && block.flowRange[1]<100000 ? block.flowRange[1] : 100000]}];
        } else if (block.kind==='text' || block.kind==='photo_text' || (block.kind==='widget' && block.source==='message')) {
            const {root,cuts} = textCuts(block.html || ''); total = cuts.length;
            make = n => {
                const [left,right] = splitText(root,cuts[n-1]);
                const tail={...block,kind:'text',html:right,boxHeight:0,layout:'columns',storyTitle:window.ElksPaperRenderer.storyTitle(block)};
                for (const key of ['source','officer','src','caption','width','height','fit','ratio','side','photos','resolvedHTML','flowRange','html2']) delete tail[key];
                return [{...block,html:left},tail];
            };
        } else return null;
        if (total<2) return null;
        let low=1,high=total-1,best=0;
        while (low<=high) {
            const mid=Math.floor((low+high)/2); const [head] = make(mid);
            if (fits({...head,reserveContinuation:true})) {best=mid;low=mid+1;} else high=mid-1;
        }
        if (!best) return null;
        const [head,tail]=make(best); const group=block.flowGroup || block.id;
        head.flowGroup=group; tail.flowGroup=group; tail.id=uid(); tail.continuation=true;
        return [head,tail];
    }
    function paginate(payload, root, {compact=false, reserve=0, attempt=0}={}) {
        const original=copy(payload.document);
        if(original.pages.some(page=>page.locked || page.fullPage || page.allowOverflow)) {
            const pages=[];let run=[],continuations=0;
            const flush=()=>{
                if(!run.length)return;
                const segment={...payload,document:{...original,pages:run}};
                const result=paginate(segment,root,{compact,reserve,attempt});
                pages.push(...segment.document.pages);continuations+=result.continuations;run=[];
            };
            for(const page of original.pages){if(page.locked || page.fullPage || page.allowOverflow){flush();pages.push(page);}else run.push(page);}
            flush();
            if(pages.length>60)throw new Error('Flow exceeded 60 pages. Unlock or reduce content.');
            payload.document.pages=pages;window.ElksPaperRenderer.render(root,payload);
            return {pages:pages.length,continuations};
        }
        const queue=storyBlocks(original.pages.flatMap(page=>page.blocks));
        // Dynamic snapshots may include CSS affecting other pages (e.g. calendars).
        // Keep every snapshot stylesheet active while measuring partial pages.
        const styles=document.createElement('style');
        styles.textContent=queue.flatMap(block=>{
            const node=document.createElement('div');node.innerHTML=block.resolvedHTML || '';
            return [...node.querySelectorAll('style')].map(style=>style.textContent);
        }).join('\n');
        document.head.append(styles);
        try {
            payload.document.pages=[{...original.pages[0],blocks:[]}];
            const render=()=>window.ElksPaperRenderer.render(root,payload);
            const fits=()=>{const content=root.lastElementChild.querySelector('.paper-content');const top=content.getBoundingClientRect().top;
                const used=Math.max(0,...[...content.children].map(row=>row.getBoundingClientRect().bottom-top));
                return used<=content.clientHeight-(content.classList.contains('paper-align-page') ? 0 : reserve)+1 && content.scrollHeight<=content.clientHeight+1 && content.scrollWidth<=content.clientWidth+1;};
            let page=payload.document.pages[0], continuations=0;
            for (let index=0;index<queue.length;index++) {
                let block=queue[index];
                if (compact) {
                    Object.assign(block,{compact:true,gap:Math.min(block.gap ?? 12,4),padding:Math.min(block.padding || 0,4),boxHeight:0,lineHeight:1.15,paragraphGap:4});
                    if (block.kind==='spacer') block.height=Math.min(block.height || 0,8);
                }
                page.blocks.push(block); render();
                if (fits()) continue;
                const last=page.blocks.length-1;
                const parts=split(block,head=>{page.blocks[last]=head;render();return fits();});
                page.blocks[last]=block;
                if (parts) {
                    page.blocks[last]=parts[0]; queue.splice(index+1,0,parts[1]); continuations++;
                } else if (page.blocks.length===1) continue; // Visible overset; never clip or drop it.
                else {page.blocks.pop(); index--;}
                if (payload.document.pages.length>=60) {payload.document=original;render();styles.remove();throw new Error('Flow exceeded 60 pages. Original layout restored.');}
                // Keep standalone headings with the following content where possible.
                const heading=!parts && page.blocks.at(-1)?.kind==='heading' && page.blocks.length>1 ? page.blocks.pop() : null;
                page={id:uid(),blocks:heading?[heading]:[]};payload.document.pages.push(page);
            }
            payload.document.pages=payload.document.pages.filter(page=>page.blocks.length || payload.document.pages.length===1);
            render(); styles.remove();
            const overflow=Math.max(0,...[...root.querySelectorAll('.paper-content')].map(content=>content.scrollHeight-content.clientHeight));
            // Links and cross-page snapshot styles must also fit after all pages exist.
            if(overflow>1 && queue.some(block=>block.flowGroup) && attempt<4) {
                payload.document=original;
                return paginate(payload,root,{compact,reserve:reserve+overflow+2,attempt:attempt+1});
            }
            return {pages:payload.document.pages.length,continuations};
        } catch(error) {
            payload.document=original;
            window.ElksPaperRenderer.render(root,payload);
            throw error;
        } finally {
            styles.remove();
        }
    }
    window.ElksPaperPagination={paginate,storyBlocks};
})();
