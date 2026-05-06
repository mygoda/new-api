/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { lazy, Suspense, useContext, useMemo } from 'react';
import { Route, Routes, useLocation, useParams, Navigate } from 'react-router-dom';
import Loading from './components/common/ui/Loading';
import { AuthRedirect, PrivateRoute, AdminRoute, DealerRoute } from './helpers';
import SetupCheck from './components/layout/SetupCheck';
import { StatusContext } from './context/Status';

// Routes are split lazily so the home page bundle stays small. Touch this list
// when adding new top-level pages — direct imports here will balloon the main
// bundle and slow down first paint after every deploy.
const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const About = lazy(() => import('./pages/About'));
const Docs = lazy(() => import('./pages/Docs'));
const UserAgreement = lazy(() => import('./pages/UserAgreement'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));

const NotFound = lazy(() => import('./pages/NotFound'));
const Forbidden = lazy(() => import('./pages/Forbidden'));
const Setup = lazy(() => import('./pages/Setup'));

const LoginForm = lazy(() => import('./components/auth/LoginForm'));
const RegisterForm = lazy(() => import('./components/auth/RegisterForm'));
const PasswordResetForm = lazy(() => import('./components/auth/PasswordResetForm'));
const PasswordResetConfirm = lazy(() => import('./components/auth/PasswordResetConfirm'));
const OAuth2Callback = lazy(() => import('./components/auth/OAuth2Callback'));

const User = lazy(() => import('./pages/User'));
const Setting = lazy(() => import('./pages/Setting'));
const PersonalSetting = lazy(() => import('./components/settings/PersonalSetting'));

const Channel = lazy(() => import('./pages/Channel'));
const Group = lazy(() => import('./pages/Group'));
const Ability = lazy(() => import('./pages/Ability'));
const Heartbeat = lazy(() => import('./pages/Heartbeat'));
const Token = lazy(() => import('./pages/Token'));
const Redemption = lazy(() => import('./pages/Redemption'));
const TopUp = lazy(() => import('./pages/TopUp'));
const Log = lazy(() => import('./pages/Log'));
const RequestLogs = lazy(() => import('./pages/RequestLogs'));
const Billing = lazy(() => import('./pages/Billing'));
const Chat = lazy(() => import('./pages/Chat'));
const Chat2Link = lazy(() => import('./pages/Chat2Link'));
const Midjourney = lazy(() => import('./pages/Midjourney'));
const Pricing = lazy(() => import('./pages/Pricing'));
const MarketplacePage = lazy(() => import('./pages/Marketplace'));
const Task = lazy(() => import('./pages/Task'));
const ModelPage = lazy(() => import('./pages/Model'));
const ModelDeploymentPage = lazy(() => import('./pages/ModelDeployment'));
const Playground = lazy(() => import('./pages/Playground'));
const Creation = lazy(() => import('./pages/Creation'));
const Subscription = lazy(() => import('./pages/Subscription'));
const DealerUsers = lazy(() => import('./pages/Dealer/Users'));
const DealerBilling = lazy(() => import('./pages/Dealer/Billing'));

// Wrap a lazy element with Suspense + key for transition-aware fallbacks.
const lazyRoute = (element, key) => (
  <Suspense fallback={<Loading />} key={key}>
    {element}
  </Suspense>
);

function DynamicOAuth2Callback() {
  const { provider } = useParams();
  return <OAuth2Callback type={provider} />;
}

function App() {
  const location = useLocation();
  const [statusState] = useContext(StatusContext);

  // 获取「模型」(marketplaceV2) 权限配置：{enabled, requireAdmin}
  const marketplaceConfig = useMemo(() => {
    const fallback = { enabled: true, requireAdmin: false };
    const raw = statusState?.status?.HeaderNavModules;
    if (!raw) return fallback;
    try {
      const modules = JSON.parse(raw);
      const cfg = modules.marketplaceV2;
      if (typeof cfg === 'object' && cfg !== null) {
        return {
          enabled: cfg.enabled !== false,
          requireAdmin: cfg.requireAdmin === true,
        };
      }
      if (typeof cfg === 'boolean') {
        return { enabled: cfg, requireAdmin: false };
      }
      return fallback;
    } catch (_) {
      return fallback;
    }
  }, [statusState?.status?.HeaderNavModules]);

  return (
    <SetupCheck>
      <Routes>
        <Route path='/' element={lazyRoute(<Home />, location.pathname)} />
        <Route path='/setup' element={lazyRoute(<Setup />, location.pathname)} />
        <Route path='/forbidden' element={lazyRoute(<Forbidden />, location.pathname)} />
        <Route
          path='/console/models'
          element={
            <AdminRoute>{lazyRoute(<ModelPage />, location.pathname)}</AdminRoute>
          }
        />
        <Route
          path='/console/deployment'
          element={
            <AdminRoute>{lazyRoute(<ModelDeploymentPage />, location.pathname)}</AdminRoute>
          }
        />
        <Route
          path='/console/subscription'
          element={
            <AdminRoute>{lazyRoute(<Subscription />, location.pathname)}</AdminRoute>
          }
        />
        <Route
          path='/console/channel'
          element={<AdminRoute>{lazyRoute(<Channel />, location.pathname)}</AdminRoute>}
        />
        <Route
          path='/console/group'
          element={<AdminRoute>{lazyRoute(<Group />, location.pathname)}</AdminRoute>}
        />
        <Route
          path='/console/ability'
          element={<AdminRoute>{lazyRoute(<Ability />, location.pathname)}</AdminRoute>}
        />
        <Route
          path='/console/heartbeat'
          element={<AdminRoute>{lazyRoute(<Heartbeat />, location.pathname)}</AdminRoute>}
        />
        <Route
          path='/console/token'
          element={<PrivateRoute>{lazyRoute(<Token />, location.pathname)}</PrivateRoute>}
        />
        <Route
          path='/console/playground'
          element={<PrivateRoute>{lazyRoute(<Playground />, location.pathname)}</PrivateRoute>}
        />
        <Route
          path='/console/creation'
          element={<Navigate to='/creation' replace />}
        />
        <Route
          path='/console/creation/:tab'
          element={<Navigate to='/creation' replace />}
        />
        <Route
          path='/creation'
          element={<PrivateRoute>{lazyRoute(<Creation />, location.pathname)}</PrivateRoute>}
        />
        <Route
          path='/creation/:tab'
          element={<PrivateRoute>{lazyRoute(<Creation />, location.pathname)}</PrivateRoute>}
        />
        <Route
          path='/console/redemption'
          element={<AdminRoute>{lazyRoute(<Redemption />, location.pathname)}</AdminRoute>}
        />
        <Route
          path='/console/user'
          element={<AdminRoute>{lazyRoute(<User />, location.pathname)}</AdminRoute>}
        />
        <Route
          path='/console/dealer/users'
          element={<DealerRoute>{lazyRoute(<DealerUsers />, location.pathname)}</DealerRoute>}
        />
        <Route
          path='/console/dealer/billing'
          element={<DealerRoute>{lazyRoute(<DealerBilling />, location.pathname)}</DealerRoute>}
        />
        <Route
          path='/user/reset'
          element={lazyRoute(<PasswordResetConfirm />, location.pathname)}
        />
        <Route
          path='/login'
          element={lazyRoute(
            <AuthRedirect>
              <LoginForm />
            </AuthRedirect>,
            location.pathname,
          )}
        />
        <Route
          path='/register'
          element={lazyRoute(
            <AuthRedirect>
              <RegisterForm />
            </AuthRedirect>,
            location.pathname,
          )}
        />
        <Route
          path='/reset'
          element={lazyRoute(<PasswordResetForm />, location.pathname)}
        />
        <Route
          path='/oauth/github'
          element={lazyRoute(<OAuth2Callback type='github' />, location.pathname)}
        />
        <Route
          path='/oauth/discord'
          element={lazyRoute(<OAuth2Callback type='discord' />, location.pathname)}
        />
        <Route
          path='/oauth/oidc'
          element={lazyRoute(<OAuth2Callback type='oidc' />, 'oauth-oidc')}
        />
        <Route
          path='/oauth/linuxdo'
          element={lazyRoute(<OAuth2Callback type='linuxdo' />, location.pathname)}
        />
        <Route
          path='/oauth/:provider'
          element={lazyRoute(<DynamicOAuth2Callback />, location.pathname)}
        />
        <Route
          path='/console/setting'
          element={<AdminRoute>{lazyRoute(<Setting />, location.pathname)}</AdminRoute>}
        />
        <Route
          path='/console/personal'
          element={<PrivateRoute>{lazyRoute(<PersonalSetting />, location.pathname)}</PrivateRoute>}
        />
        <Route
          path='/console/topup'
          element={<PrivateRoute>{lazyRoute(<TopUp />, location.pathname)}</PrivateRoute>}
        />
        <Route
          path='/console/log'
          element={<PrivateRoute>{lazyRoute(<Log />, location.pathname)}</PrivateRoute>}
        />
        <Route
          path='/console/request-logs'
          element={<PrivateRoute>{lazyRoute(<RequestLogs />, location.pathname)}</PrivateRoute>}
        />
        <Route
          path='/console/billing'
          element={<PrivateRoute>{lazyRoute(<Billing />, location.pathname)}</PrivateRoute>}
        />
        <Route
          path='/console'
          element={<PrivateRoute>{lazyRoute(<Dashboard />, location.pathname)}</PrivateRoute>}
        />
        <Route
          path='/console/midjourney'
          element={<PrivateRoute>{lazyRoute(<Midjourney />, location.pathname)}</PrivateRoute>}
        />
        <Route
          path='/console/task'
          element={<PrivateRoute>{lazyRoute(<Task />, location.pathname)}</PrivateRoute>}
        />
        <Route
          path='/pricing'
          element={<AdminRoute>{lazyRoute(<Pricing />, location.pathname)}</AdminRoute>}
        />
        <Route
          path='/marketplace'
          element={
            marketplaceConfig.enabled === false ? (
              lazyRoute(<NotFound />, location.pathname)
            ) : marketplaceConfig.requireAdmin ? (
              <AdminRoute>{lazyRoute(<MarketplacePage />, location.pathname)}</AdminRoute>
            ) : (
              lazyRoute(<MarketplacePage />, location.pathname)
            )
          }
        />
        <Route path='/about' element={lazyRoute(<About />, location.pathname)} />
        <Route path='/docs' element={lazyRoute(<Docs />, location.pathname)} />
        <Route
          path='/user-agreement'
          element={lazyRoute(<UserAgreement />, location.pathname)}
        />
        <Route
          path='/privacy-policy'
          element={lazyRoute(<PrivacyPolicy />, location.pathname)}
        />
        <Route
          path='/console/chat/:id?'
          element={lazyRoute(<Chat />, location.pathname)}
        />
        {/* 方便使用chat2link直接跳转聊天... */}
        <Route
          path='/chat2link'
          element={<PrivateRoute>{lazyRoute(<Chat2Link />, location.pathname)}</PrivateRoute>}
        />
        <Route path='*' element={lazyRoute(<NotFound />, location.pathname)} />
      </Routes>
    </SetupCheck>
  );
}

export default App;
