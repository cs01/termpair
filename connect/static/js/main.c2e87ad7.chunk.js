(this.webpackJsonptermpairjs=this.webpackJsonptermpairjs||[]).push([[0],{10:function(e,t,n){"use strict";n.d(t,"a",(function(){return l}));var r=n(7),a=n(0),c=n(17),s=n.n(c),i=n(22),o=n(1);function l(e){var t=Object(a.useState)(!1),n=Object(r.a)(t,2),c=n[0],l=n[1],u=Object(a.useState)(!1),d=Object(r.a)(u,2),b=d[0],p=d[1];return Object(o.jsxs)("div",{className:"flex",children:[Object(o.jsx)("code",{className:"".concat(b||c?"bg-yellow-200":"bg-gray-300"," text-black px-2 py-1 m-2 break-all"),children:e.command}),Object(o.jsx)(s.a,{text:e.command,children:Object(o.jsx)("button",{className:"px-2",title:"Copy command to clipboard",onMouseEnter:function(){return p(!0)},onMouseLeave:function(){return p(!1)},onClick:function(){l(!0),setTimeout((function(){return l(!1)}),1500)},children:Object(o.jsx)(i.a,{className:"h-6 w-6 text-white"})})}),Object(o.jsx)("span",{className:"py-1 m-2",children:c?"Copied!":""})]})}},16:function(e,t,n){"use strict";(function(e){n.d(t,"a",(function(){return h}));var r=n(3),a=n.n(r),c=n(5),s=n(7),i=n(0),o=n.n(i),l=n(4),u=n(2),d=n(10),b=n(6),p=n(8),m=n(1);function h(t){var n,r,i,h=o.a.useState(null!==(n=null!==u.d&&void 0!==u.d?u.d:localStorage.getItem(u.f.terminalId))&&void 0!==n?n:""),f=Object(s.a)(h,2),x=f[0],j=f[1],v=o.a.useState(null!==(r=localStorage.getItem(u.f.host))&&void 0!==r?r:""),y=Object(s.a)(v,2),w=y[0],O=y[1],g=o.a.useState(null!==(i=u.c||localStorage.getItem(u.f.bootstrapAesKeyB64))&&void 0!==i?i:""),k=Object(s.a)(g,2),S=k[0],C=k[1],_=function(){var n=Object(c.a)(a.a.mark((function n(){var r,c,s,i;return a.a.wrap((function(n){for(;;)switch(n.prev=n.next){case 0:if(x){n.next=3;break}return l.b.dark("Terminal ID cannot be empty"),n.abrupt("return");case 3:if(localStorage.setItem(u.f.terminalId,x),S){n.next=7;break}return l.b.dark("Secret key cannot be empty"),n.abrupt("return");case 7:if(!t.isStaticallyHosted){n.next=23;break}if(w){n.next=11;break}return l.b.dark("Host name cannot be empty"),n.abrupt("return");case 11:n.prev=11,c=new URL(w),r=c,localStorage.setItem(u.f.host,w),n.next=21;break;case 17:return n.prev=17,n.t0=n.catch(11),l.b.dark("".concat(w," is not a valid url")),n.abrupt("return");case 21:n.next=24;break;case 23:r=u.e;case 24:return n.prev=24,n.next=27,Object(b.c)(e.from(S,"base64"),["decrypt"]);case 27:s=n.sent,localStorage.setItem(u.f.bootstrapAesKeyB64,S),n.next=35;break;case 31:return n.prev=31,n.t1=n.catch(24),l.b.dark("Secret encryption key is not valid"),n.abrupt("return");case 35:return i=Object(p.b)(r),n.next=38,t.connectToTerminalAndWebsocket(x,i,r,s);case 38:case"end":return n.stop()}}),n,null,[[11,17],[24,31]])})));return function(){return n.apply(this,arguments)}}(),N="text-black px-2 py-3 m-2 w-full font-mono",I=Object(m.jsxs)("div",{className:"flex items-center",title:"The unique Terminal ID the broadcasting terminal was provided when the sharing session began.",children:[Object(m.jsx)("span",{className:"py-2 m-2 whitespace-nowrap text-xl",children:"Terminal ID"}),Object(m.jsx)("input",{name:"terminalIdInput",type:"text",className:N,onChange:function(e){j(e.target.value)},value:x,placeholder:"abcdef123456789abcded123456789"})]}),T=Object(m.jsxs)("div",{className:"flex items-center",title:"Base 64 encoded AES key",children:[Object(m.jsx)("span",{className:"py-2 m-2 whitespace-nowrap text-xl",children:"Secret encryption key"}),Object(m.jsx)("input",{name:"bootstrapAesKeyB64Input",placeholder:"123456789abcded123456789",type:"text",className:N,onChange:function(e){C(e.target.value)},value:S})]}),E=Object(m.jsxs)("div",{className:"flex items-center",title:"The URL of an actual TermPair server that the terminal is broadcasting through.",children:[Object(m.jsx)("span",{className:"py-2 m-2 whitespace-nowrap text-xl",children:"TermPair Server URL"}),Object(m.jsx)("input",{name:"customHostInput",type:"text",className:N,placeholder:"http://localhost:8000",onChange:function(e){O(e.target.value)},value:w})]}),L=!(0!==x.length&&S.length>0&&t.isStaticallyHosted)||0!==w.length,A=Object(m.jsx)("div",{className:"flex justify-end",children:Object(m.jsx)("button",{type:"submit",title:"Connect to the specified Terminal",className:"bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full ".concat(L?"":"cursor-not-allowed"),children:"Connect"})}),U=Object(m.jsxs)("form",{onSubmit:function(e){e.preventDefault(),_()},children:[I,T,t.isStaticallyHosted?E:null,A]}),D=Object(m.jsxs)("div",{className:"py-2",children:[Object(m.jsx)("div",{className:"text-2xl py-2",children:"This page is statically hosted"}),Object(m.jsx)("div",{children:"This is a static page serving the TermPair JavaScript app. It is optional to use a statically served TermPair webapp, but it facilitates easily building and self-serving to be certain the JavaScript app has not been tampered with by an untrusted server."}),Object(m.jsx)("div",{className:"mt-5",children:"Connect to a broadcasting terminal by entering the fields below and clicking Connect."}),U]}),B=Object(m.jsxs)(m.Fragment,{children:[Object(m.jsxs)("div",{className:"py-2",children:[Object(m.jsx)("div",{className:"text-xl  py-2",children:"Quick Start"}),Object(m.jsx)("div",{children:"If you have TermPair installed, share a terminal with this host:"}),Object(m.jsx)(d.a,{command:u.h}),Object(m.jsx)("div",{children:"Or if you have pipx, you can run TermPair via pipx:"}),Object(m.jsx)(d.a,{command:u.g})]}),Object(m.jsxs)("div",{className:"py-2",children:[Object(m.jsx)("div",{className:"text-xl  py-2",children:"Install TermPair"}),Object(m.jsx)("div",{children:"Install with pipx"}),Object(m.jsx)(d.a,{command:"pipx install termpair"}),Object(m.jsx)("div",{children:"Or install with pip"}),Object(m.jsx)(d.a,{command:"pip install termpair --user"})]}),Object(m.jsxs)("div",{className:"py-2",children:[Object(m.jsx)("div",{className:"text-xl  py-2",children:"Connecting to a Terminal?"}),"If a terminal is already broadcasting and you'd like to connect to it, you don't need to install or run anything. Just fill out the form below and click Connect.",U]})]}),R=Object(m.jsxs)("div",{className:"py-2",children:[Object(m.jsx)("div",{className:"text-xl py-2",children:"TermPair Demo"}),Object(m.jsx)("div",{className:"aspect-w-16 aspect-h-9",children:Object(m.jsx)("iframe",{src:"https://www.youtube.com/embed/HF0UX4smrKk",title:"YouTube video player",frameBorder:"0",allow:"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",allowFullScreen:!0})})]});return Object(m.jsx)("div",{className:"flex justify-center max-w-3xl m-auto",children:Object(m.jsxs)("div",{className:"text-gray-200",children:[Object(m.jsxs)("div",{className:"py-2",children:[Object(m.jsx)("div",{className:"text-3xl ",children:"Welcome to TermPair!"}),"Easily share terminals with end-to-end encryption \ud83d\udd12. Terminal data is always encrypted before being routed through the server."," ",Object(m.jsx)("a",{href:"https://github.com/cs01/termpair",children:"Learn more."})]}),null===t.isStaticallyHosted?null:!0===t.isStaticallyHosted?D:B,Object(m.jsxs)("div",{className:"py-2",children:[Object(m.jsx)("div",{className:"text-2xl py-2",children:"Troubleshooting"}),Object(m.jsx)("div",{className:"text-xl ",children:"Initial connection fails or is rejected"}),Object(m.jsxs)("div",{children:["Ensure you are using a TermPair client compatible with"," ",Object(m.jsxs)("span",{className:"font-bold",children:["v",u.a]})," (the version of this webpage)"]})]}),R]})})}}).call(this,n(12).Buffer)},2:function(e,t,n){"use strict";n.d(t,"a",(function(){return a})),n.d(t,"e",(function(){return c})),n.d(t,"d",(function(){return s})),n.d(t,"c",(function(){return i})),n.d(t,"b",(function(){return o})),n.d(t,"h",(function(){return d})),n.d(t,"g",(function(){return b})),n.d(t,"i",(function(){return p})),n.d(t,"f",(function(){return m}));var r=n(15),a="0.3.1.2",c=new URL("".concat(window.location.protocol,"//").concat(window.location.hostname,":").concat(window.location.port).concat(window.location.pathname)),s=new URLSearchParams(window.location.search).get("terminal_id"),i=window.location.hash.substring(1,window.location.hash.length-1),o="Terminal was shared in read only mode. Unable to send data to terminal's input.",l="".concat(window.location.protocol,"//").concat(window.location.hostname).concat(window.location.pathname),u=window.location.port;window.location.port||(u="https:"===window.location.protocol?"443":"80");var d='termpair share --host "'.concat(l,'" --port ').concat(u),b="pipx run ".concat(d),p=new r.Terminal({cursorBlink:!0,macOptionIsMeta:!0,scrollback:1e3}),m={bootstrapAesKeyB64:"termpairBase64BootstrapKey",terminalId:"termpairTerminalId",host:"termpairCustomHost"}},29:function(e,t,n){},42:function(e,t,n){"use strict";n.r(t);var r=n(0),a=n.n(r),c=n(11),s=n.n(c),i=(n(29),n(3)),o=n.n(i),l=n(5),u=n(7),d=(n(31),n(6)),b=n(4);n(36);function p(){return window.crypto.getRandomValues(new Uint8Array(12)).toString()}function m(){return h.apply(this,arguments)}function h(){return(h=Object(l.a)(o.a.mark((function e(){return o.a.wrap((function(e){for(;;)switch(e.prev=e.next){case 0:return e.abrupt("return",JSON.stringify({event:"new_browser_connected",payload:{}}));case 1:case"end":return e.stop()}}),e)})))).apply(this,arguments)}function f(e,t,n){return x.apply(this,arguments)}function x(){return(x=Object(l.a)(o.a.mark((function e(t,n,r){return o.a.wrap((function(e){for(;;)switch(e.prev=e.next){case 0:return e.t0=JSON,e.next=3,Object(d.b)(t,JSON.stringify({data:n,salt:p()}),r);case 3:return e.t1=e.sent,e.t2={event:"command",payload:e.t1},e.abrupt("return",e.t0.stringify.call(e.t0,e.t2));case 6:case"end":return e.stop()}}),e)})))).apply(this,arguments)}var j=n(16),v=n(2),y=n.p+"static/media/logo.0cb35f08.png",w=n(1),O=Object(w.jsx)("svg",{width:"24",height:"24",fill:"currentColor",className:"text-gray-300 mr-3 ",children:Object(w.jsx)("path",{fillRule:"evenodd",clipRule:"evenodd",d:"M12 2C6.477 2 2 6.463 2 11.97c0 4.404 2.865 8.14 6.839 9.458.5.092.682-.216.682-.48 0-.236-.008-.864-.013-1.695-2.782.602-3.369-1.337-3.369-1.337-.454-1.151-1.11-1.458-1.11-1.458-.908-.618.069-.606.069-.606 1.003.07 1.531 1.027 1.531 1.027.892 1.524 2.341 1.084 2.91.828.092-.643.35-1.083.636-1.332-2.22-.251-4.555-1.107-4.555-4.927 0-1.088.39-1.979 1.029-2.675-.103-.252-.446-1.266.098-2.638 0 0 .84-.268 2.75 1.022A9.606 9.606 0 0112 6.82c.85.004 1.705.114 2.504.336 1.909-1.29 2.747-1.022 2.747-1.022.546 1.372.202 2.386.1 2.638.64.696 1.028 1.587 1.028 2.675 0 3.83-2.339 4.673-4.566 4.92.359.307.678.915.678 1.846 0 1.332-.012 2.407-.012 2.734 0 .267.18.577.688.48C19.137 20.107 22 16.373 22 11.969 22 6.463 17.522 2 12 2z"})});function g(e){return Object(w.jsx)("div",{className:"bg-black w-full",children:Object(w.jsxs)("div",{className:"flex max-w-3xl m-auto h-10 items-center justify-between",children:[Object(w.jsx)("div",{className:"h-full",children:Object(w.jsx)("a",{href:window.location.pathname,children:Object(w.jsx)("img",{className:"h-full",src:y,alt:"logo"})})}),Object(w.jsxs)("div",{className:"flex",children:[Object(w.jsxs)("span",{className:"text-gray-300 mx-3",children:["v",v.a]}),Object(w.jsx)("a",{href:"https://github.com/cs01/termpair",title:"GitHub homepage",children:O})]})]})})}var k=n(19),S=n(20),C=n(24),_=n(23),N=function(e){Object(C.a)(n,e);var t=Object(_.a)(n);function n(e){var r;return Object(k.a)(this,n),(r=t.call(this,e)).state={hasError:!1},r}return Object(S.a)(n,[{key:"componentDidCatch",value:function(e,t){console.error(e),console.error(t)}},{key:"render",value:function(){return this.state.hasError?Object(w.jsx)("h1",{className:"text-white",children:"Something went wrong."}):this.props.children}}],[{key:"getDerivedStateFromError",value:function(e){return{hasError:!0}}}]),n}(a.a.Component),I=n(21),T=n.n(I);function E(e){var t,n,r="Connection Established"===e.status,a=null!=e.terminalId,c=a?Object(w.jsx)("div",{children:e.status}):null,s=r?Object(w.jsx)("div",{title:"Whether you are allowed to send data to the terminal's input. This setting is controlled when initially sharing the terminal, and cannot be changed after sharing has begun.",children:(null===(t=e.terminalData)||void 0===t?void 0:t.allow_browser_control)&&r?"read/write":"read only"}):null,i=r?Object(w.jsxs)("div",{title:"Number of other browsers connected to this terminal",children:[e.numClients?e.numClients:"0"," Connected Client(s)"]}):null,o=r?Object(w.jsxs)("div",{children:["Started at"," ",T()(null===(n=e.terminalData)||void 0===n?void 0:n.broadcast_start_time_iso).format("h:mm a on MMM Do, YYYY")]}):null,l=r?Object(w.jsxs)("div",{title:"Dimensions of terminal, rows x cols",children:[e.terminalSize.rows,"x",e.terminalSize.cols]}):null;return Object(w.jsxs)("div",{children:[a?Object(w.jsxs)("div",{className:"py-1 flex flex-wrap space-x-3 items-center ".concat(r?"bg-green-900":"bg-red-900","   justify-evenly text-gray-300"),children:[c,l,s,i,o]}):null,Object(w.jsx)("footer",{className:"flex bg-black  justify-evenly text-gray-300 py-5",children:Object(w.jsxs)("div",{children:[Object(w.jsx)("a",{href:"https://chadsmith.dev",children:"chadsmith.dev"})," |"," ",Object(w.jsx)("a",{href:"https://github.com/cs01/termpair",children:"GitHub"})]})})]})}var L=n(8);var A=n(9);var U=function(){var e=Object(r.useState)(null),t=Object(u.a)(e,2),n=t[0],a=t[1],c=Object(r.useState)(null),s=Object(u.a)(c,2),i=s[0],p=s[1],h=Object(r.useState)(0),x=Object(u.a)(h,2),y=x[0],O=x[1],k=Object(r.useRef)({browser:null,unix:null,ivCount:null,maxIvCount:null}),S=Object(r.useRef)(!1),C=Object(r.useState)(null),_=Object(u.a)(C,2),I=_[0],T=_[1],U=null!==I,D=Object(r.useState)({rows:20,cols:81}),B=Object(u.a)(D,2),R=B[0],P=B[1],H=Object(r.useState)(null),F=Object(u.a)(H,2),J=F[0],M=F[1],K=Object(r.useState)(null),z=Object(u.a)(K,2),W=z[0],Y=z[1],q=Object(r.useState)(v.d),G=Object(u.a)(q,2),V=G[0],Q=G[1];Object(r.useEffect)((function(){(function(){var e=Object(l.a)(o.a.mark((function e(){var t,n,r,c,s,i,l,u,b,p;return o.a.wrap((function(e){for(;;)switch(e.prev=e.next){case 0:return e.prev=0,e.next=3,fetch(v.e.toString()+"ping",{mode:"same-origin"});case 3:return n=e.sent,e.next=6,n.json();case 6:r=e.sent,c="pong"===r,s=200===n.status&&c,a(t=!s),e.next=17;break;case 13:e.prev=13,e.t0=e.catch(0),a(t=!0);case 17:return e.next=19,Object(d.d)();case 19:if(i=e.sent,l=new URLSearchParams(window.location.search).get("termpair_server_url"),u=l?new URL(l):null,b=t?u:v.e,!(V&&b&&i)){e.next=27;break}return p=Object(L.b)(b),e.next=27,Z(V,p,b,i);case 27:case"end":return e.stop()}}),e,null,[[0,13]])})));return function(){return e.apply(this,arguments)}})()()}),[]),Object(r.useLayoutEffect)((function(){!function(e,t){if(!e.current){var n=document.getElementById("terminal");n&&(t.open(n),e.current=!0,t.writeln("Welcome to TermPair! https://github.com/cs01/termpair"),t.writeln(""))}}(S,v.i)}),[U]);var X=function(e){M(e),function(e,t,n){switch(n(e),e){case null:break;case"Connection Established":Object(L.a)(e),v.i.writeln("Connection established with end-to-end encryption \ud83d\udd12."),v.i.writeln("The termpair server and third parties can't read transmitted data."),v.i.writeln(""),v.i.writeln("You can copy text with ctrl+shift+c or ctrl+shift+x, and paste with ctrl+shift+v."),v.i.writeln("");break;case"Disconnected":Object(L.a)(e),"Connection Established"===t&&(v.i.writeln("\x1b[1;31mTerminal session has ended\x1b[0m"),v.i.writeln(""));break;case"Terminal ID is invalid":b.b.dark("An invalid Terminal ID was provided. Check that the session is still being broadcast and that the ID is entered correctly.");break;case"Failed to obtain encryption keys":b.b.dark("Failed to obtain secret encryption keys from the broadcasting terminal. Is your encryption key valid?");break;case"Browser is not running in a secure context":b.b.dark("Fatal Error: TermPair only works on secure connections. Ensure url starts with https. See https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts and `termpair serve --help` for more information.");break;case"Connecting...":case"Connection Error":case"Failed to fetch terminal data":break;default:!function(e){throw Error}()}}(e,W,Y)};function Z(e,t,n,r){return $.apply(this,arguments)}function $(){return($=Object(l.a)(o.a.mark((function e(t,n,r,a){var c,s;return o.a.wrap((function(e){for(;;)switch(e.prev=e.next){case 0:return Q(t),p(null),e.prev=2,e.next=5,fetch(new URL("terminal/".concat(t),r).toString());case 5:if(200!==(c=e.sent).status){e.next=14;break}return e.next=9,c.json();case 9:s=e.sent,p(s),ee(t,s,n,a),e.next=15;break;case 14:X("Terminal ID is invalid");case 15:e.next=21;break;case 17:e.prev=17,e.t0=e.catch(2),X("Failed to fetch terminal data"),b.b.dark("Error fetching terminal data from ".concat(r.toString(),". Is the URL correct? Error message: ").concat(String(e.t0.message)),{autoClose:!1});case 21:case"end":return e.stop()}}),e,null,[[2,17]])})))).apply(this,arguments)}function ee(e,t,n,r){I&&(b.b.dark("Closing existing connection"),I.close()),X("Connecting...");var a=new URL("connect_browser_to_terminal?terminal_id=".concat(e),n),c=new WebSocket(a.toString());T(c);var s,i,u,p,h=function(e,t,n){return function(){var r=Object(l.a)(o.a.mark((function r(a){return o.a.wrap((function(r){for(;;)switch(r.prev=r.next){case 0:if(r.prev=0,!1!==t.allow_browser_control){r.next=4;break}return Object(L.a)(v.b),r.abrupt("return");case 4:if(null!==n.current.browser&&null!==n.current.ivCount&&null!==n.current.maxIvCount){r.next=7;break}return b.b.dark("Cannot input because it cannot be encrypted. Encryption keys are missing."),r.abrupt("return");case 7:return r.t0=e,r.next=10,f(n.current.browser,a,n.current.ivCount++);case 10:r.t1=r.sent,r.t0.send.call(r.t0,r.t1),Object(d.e)(n.current.ivCount,n.current.maxIvCount)&&(e.send(JSON.stringify({event:"request_key_rotation"})),n.current.maxIvCount+=1e3),r.next=18;break;case 15:r.prev=15,r.t2=r.catch(0),b.b.dark("Failed to send data to terminal ".concat(r.t2));case 18:case"end":return r.stop()}}),r,null,[[0,15]])})));return function(e){return r.apply(this,arguments)}}()}(c,t,k);v.i.attachCustomKeyEventHandler((s=v.i,i=null===t||void 0===t?void 0:t.allow_browser_control,u=h,function(e){if("keydown"!==e.type)return!0;if(e.ctrlKey&&e.shiftKey){var t=e.key.toLowerCase();if("v"===t)return i?(navigator.clipboard.readText().then((function(e){u(e)})),!1):(Object(L.a)(v.b),!1);if("c"===t||"x"===t){var n=s.getSelection();return navigator.clipboard.writeText(n),s.focus(),!1}}return!0})),c.addEventListener("open",function(){var e=Object(l.a)(o.a.mark((function e(t){var n;return o.a.wrap((function(e){for(;;)switch(e.prev=e.next){case 0:return X("Connection Established"),c.send(JSON.stringify({event:"request_terminal_dimensions"})),e.next=4,m();case 4:n=e.sent,c.send(n),p=v.i.onData(h);case 7:case"end":return e.stop()}}),e)})));return function(t){return e.apply(this,arguments)}}()),c.addEventListener("close",(function(e){p&&p.dispose(),X("Disconnected"),O(0)})),c.addEventListener("error",(function(e){p&&p.dispose(),console.error(e),b.b.dark("Websocket Connection Error: ".concat(JSON.stringify(e))),X("Connection Error"),O(0)})),c.addEventListener("message",function(){var e=Object(l.a)(o.a.mark((function e(t){var n;return o.a.wrap((function(e){for(;;)switch(e.prev=e.next){case 0:e.prev=0,n=JSON.parse(t.data),e.next=8;break;case 4:return e.prev=4,e.t0=e.catch(0),b.b.dark("Failed to parse websocket message"),e.abrupt("return");case 8:e.t1=n.event,e.next="new_output"===e.t1?11:"resize"===e.t1?12:"num_clients"===e.t1?13:"aes_keys"===e.t1?14:"aes_key_rotation"===e.t1?15:"error"===e.t1?16:17;break;case 11:return e.abrupt("return",A.a.new_output(k,n));case 12:return e.abrupt("return",A.a.resize(n,P));case 13:return e.abrupt("return",A.a.num_clients(O,n));case 14:return e.abrupt("return",A.a.aes_keys(k,r,n,X));case 15:return e.abrupt("return",A.a.aes_key_rotation(k,n));case 16:return e.abrupt("return",A.a.error(n));case 17:return function(e){throw Error}(n.event),e.abrupt("return",A.a.default(n));case 19:case"end":return e.stop()}}),e,null,[[0,4]])})));return function(t){return e.apply(this,arguments)}}())}var te=Object(w.jsx)("div",{className:"p-5 text-white flex-grow w-auto m-auto",children:U?Object(w.jsx)("div",{id:"terminal",className:"p-1 bg-gray-900 flex-grow text-gray-400 m-auto"}):Object(w.jsx)(j.a,{isStaticallyHosted:n,connectToTerminalAndWebsocket:Z})});return Object(w.jsx)(N,{children:Object(w.jsxs)("div",{className:"flex flex-col h-screen align-middle max-w-full m-auto",children:[Object(w.jsx)(b.a,{position:"bottom-right",limit:3,autoClose:5e3,hideProgressBar:!1,newestOnTop:!1,closeOnClick:!0,rtl:!1,pauseOnFocusLoss:!1,draggable:!0,pauseOnHover:!0}),Object(w.jsx)(g,{}),te,Object(w.jsx)(E,{terminalData:i,status:J,terminalId:V,terminalSize:R,numClients:y})]})})};s.a.render(Object(w.jsx)(a.a.StrictMode,{children:Object(w.jsx)(U,{})}),document.getElementById("root"))},6:function(e,t,n){"use strict";(function(e){n.d(t,"c",(function(){return i})),n.d(t,"d",(function(){return l})),n.d(t,"a",(function(){return d})),n.d(t,"b",(function(){return m})),n.d(t,"e",(function(){return f}));var r=n(3),a=n.n(r),c=n(5),s=n(2);function i(e,t){return o.apply(this,arguments)}function o(){return(o=Object(c.a)(a.a.mark((function e(t,n){return a.a.wrap((function(e){for(;;)switch(e.prev=e.next){case 0:return e.next=2,window.crypto.subtle.importKey("raw",t,{name:"AES-GCM"},!1,n);case 2:return e.abrupt("return",e.sent);case 3:case"end":return e.stop()}}),e)})))).apply(this,arguments)}function l(){return u.apply(this,arguments)}function u(){return(u=Object(c.a)(a.a.mark((function t(){var n;return a.a.wrap((function(t){for(;;)switch(t.prev=t.next){case 0:if(t.prev=0,s.c){t.next=3;break}return t.abrupt("return",null);case 3:return n=e.from(s.c,"base64"),t.next=6,i(n,["decrypt"]);case 6:return t.abrupt("return",t.sent);case 9:return t.prev=9,t.t0=t.catch(0),console.error(t.t0),t.abrupt("return",null);case 13:case"end":return t.stop()}}),t,null,[[0,9]])})))).apply(this,arguments)}function d(e,t){return b.apply(this,arguments)}function b(){return(b=Object(c.a)(a.a.mark((function t(n,r){var c,s,i;return a.a.wrap((function(t){for(;;)switch(t.prev=t.next){case 0:return c=r.subarray(0,12),s=r.subarray(12),t.t0=e,t.next=5,window.crypto.subtle.decrypt({name:"AES-GCM",iv:c},n,s);case 5:return t.t1=t.sent,i=t.t0.from.call(t.t0,t.t1),t.abrupt("return",i);case 8:case"end":return t.stop()}}),t)})))).apply(this,arguments)}function p(e){var t=new Uint8Array(12),n=[];for(n.unshift(255&e);e>=256;)e>>>=8,n.unshift(255&e);return t.set(n),t}function m(e,t,n){return h.apply(this,arguments)}function h(){return(h=Object(c.a)(a.a.mark((function e(t,n,r){var c,s,i,o;return a.a.wrap((function(e){for(;;)switch(e.prev=e.next){case 0:return c=p(r),e.next=3,window.crypto.subtle.encrypt({name:"AES-GCM",iv:c},t,(new TextEncoder).encode(n));case 3:return s=e.sent,i=x(c,s),o=j(i),e.abrupt("return",o);case 7:case"end":return e.stop()}}),e)})))).apply(this,arguments)}function f(e,t){return e>=t}function x(e,t){var n=new Uint8Array(e.byteLength+t.byteLength);return n.set(new Uint8Array(e),0),n.set(new Uint8Array(t),e.byteLength),n.buffer}function j(e){for(var t=new Uint8Array(e),n="",r=t.byteLength,a=0;a<r;a++)n+=String.fromCharCode(t[a]);return window.btoa(n)}}).call(this,n(12).Buffer)},8:function(e,t,n){"use strict";n.d(t,"b",(function(){return c})),n.d(t,"a",(function(){return s}));var r=n(4),a=n(18);function c(e){return new URL(e.toString().replace(/^http/,"ws"))}var s=Object(a.debounce)((function(e){r.b.dark(e)}),100)},9:function(e,t,n){"use strict";(function(e){n.d(t,"a",(function(){return u}));var r=n(13),a=n(3),c=n.n(a),s=n(5),i=n(4),o=n(2),l=n(6),u={new_output:function(){var t=Object(s.a)(c.a.mark((function t(n,r){var a,s,i;return c.a.wrap((function(t){for(;;)switch(t.prev=t.next){case 0:if(n.current.unix){t.next=3;break}return console.error("Missing AES CryptoKey for unix terminal. Cannot decrypt message."),t.abrupt("return");case 3:return t.next=5,Object(l.a)(n.current.unix,e.from(r.payload,"base64"));case 5:a=t.sent,s=JSON.parse(a.toString()),i=e.from(s.pty_output,"base64"),o.i.write(i);case 9:case"end":return t.stop()}}),t)})));return function(e,n){return t.apply(this,arguments)}}(),resize:function(e,t){if(e.payload.cols&&e.payload.rows){var n=e.payload.cols,r=e.payload.rows;t({cols:n,rows:r}),o.i.resize(n,r)}},num_clients:function(e,t){var n=t.payload;e(n)},aes_keys:function(){var t=Object(s.a)(c.a.mark((function t(n,a,s,i){var o,u,d,b;return c.a.wrap((function(t){for(;;)switch(t.prev=t.next){case 0:return t.prev=0,t.next=3,Object(l.a)(a,e.from(s.payload.b64_bootstrap_unix_aes_key,"base64"));case 3:return o=t.sent,t.next=6,Object(l.c)(o,["decrypt"]);case 6:return n.current.unix=t.sent,t.next=9,Object(l.a)(a,e.from(s.payload.b64_bootstrap_browser_aes_key,"base64"));case 9:return u=t.sent,t.next=12,Object(l.c)(u,["encrypt"]);case 12:if(n.current.browser=t.sent,null!=s.payload.iv_count&&null!=s.payload.max_iv_count){t.next=16;break}throw console.error("missing required iv parameters"),Error("missing required iv parameters");case 16:if(d=n.current.ivCount=parseInt(s.payload.iv_count,10),!((b=n.current.maxIvCount=parseInt(s.payload.max_iv_count,10))<d)){t.next=22;break}throw console.error("Initialized IV counter is below max value ".concat(d," vs ").concat(b)),n.current=Object(r.a)(Object(r.a)({},n.current),{},{browser:null,maxIvCount:null,ivCount:null,unix:null}),Error;case 22:t.next=31;break;case 24:if(t.prev=24,t.t0=t.catch(0),null!=n.current.browser&&null!=n.current.unix&&null!=n.current.ivCount&&null!=n.current.maxIvCount){t.next=31;break}return console.error(t.t0),console.error(s),i("Failed to obtain encryption keys"),t.abrupt("return");case 31:case"end":return t.stop()}}),t,null,[[0,24]])})));return function(e,n,r,a){return t.apply(this,arguments)}}(),aes_key_rotation:function(){var t=Object(s.a)(c.a.mark((function t(n,r){var a,s;return c.a.wrap((function(t){for(;;)switch(t.prev=t.next){case 0:if(n.current.unix){t.next=3;break}return console.error("Cannot decrypt new AES keys"),t.abrupt("return");case 3:return t.prev=3,t.next=6,Object(l.a)(n.current.unix,r.payload.b64_aes_secret_unix_key);case 6:return a=t.sent,t.next=9,Object(l.a)(n.current.unix,e.from(r.payload.b64_aes_secret_browser_key,"base64"));case 9:return s=t.sent,t.next=12,Object(l.c)(s,["encrypt"]);case 12:return n.current.browser=t.sent,t.next=15,Object(l.c)(a,["decrypt"]);case 15:n.current.unix=t.sent,t.next=22;break;case 18:t.prev=18,t.t0=t.catch(3),console.error(t.t0),i.b.dark("AES key rotation failed: ".concat(t.t0));case 22:case"end":return t.stop()}}),t,null,[[3,18]])})));return function(e,n){return t.apply(this,arguments)}}(),error:function(e){i.b.dark("Error: ".concat(e.payload)),console.error(e)},default:function(e){i.b.dark("Unknown event received: ".concat(e.event)),console.error("unknown event type",e)}}}).call(this,n(12).Buffer)}},[[42,1,2]]]);
//# sourceMappingURL=main.c2e87ad7.chunk.js.map