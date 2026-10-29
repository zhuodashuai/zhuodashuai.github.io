import base from './playwright.config.mjs';
export default {...base,testMatch:'canonical-example-components.spec.mjs',
  use:{...base.use,baseURL:'http://127.0.0.1:4192',serviceWorkers:'block'},
  webServer:{...base.webServer,command:'node tooling/tests/e2e/component-server.mjs',url:'http://127.0.0.1:4192/',reuseExistingServer:false}};
