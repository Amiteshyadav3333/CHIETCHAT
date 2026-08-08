import React from 'react';

const RouterContext = React.createContext({ path: '/', params: {}, navigate: () => {} });

const normalizePath = (target) => {
    if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//') || target.includes('\\')) {
        throw new Error('Only same-origin application paths are allowed');
    }
    const parsed = new URL(target, window.location.origin);
    if (parsed.origin !== window.location.origin) throw new Error('Cross-origin navigation is blocked');
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};

export const BrowserRouter = ({ children }) => {
    const [path, setPath] = React.useState(() => window.location.pathname);
    React.useEffect(() => {
        const onPopState = () => setPath(window.location.pathname);
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);
    const navigate = React.useCallback((target, options = {}) => {
        if (typeof target === 'number') {
            window.history.go(target);
            return;
        }
        const safeTarget = normalizePath(target);
        window.history[options.replace ? 'replaceState' : 'pushState']({}, '', safeTarget);
        setPath(window.location.pathname);
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, []);
    return <RouterContext.Provider value={{ path, params: {}, navigate }}>{children}</RouterContext.Provider>;
};

const matchPath = (pattern, actual) => {
    const expected = pattern.split('/').filter(Boolean);
    const received = actual.split('/').filter(Boolean);
    if (expected.length !== received.length) return null;
    const params = {};
    for (let index = 0; index < expected.length; index += 1) {
        if (expected[index].startsWith(':')) params[expected[index].slice(1)] = decodeURIComponent(received[index]);
        else if (expected[index] !== received[index]) return null;
    }
    return params;
};

export const Routes = ({ children }) => {
    const context = React.useContext(RouterContext);
    for (const child of React.Children.toArray(children)) {
        const params = matchPath(child.props.path, context.path);
        if (params) {
            return <RouterContext.Provider value={{ ...context, params }}>{child.props.element}</RouterContext.Provider>;
        }
    }
    return <Navigate to="/" replace />;
};

export const Route = () => null;

export const Navigate = ({ to, replace = false }) => {
    const navigate = useNavigate();
    React.useEffect(() => { navigate(to, { replace }); }, [navigate, replace, to]);
    return null;
};

export const useNavigate = () => React.useContext(RouterContext).navigate;
export const useParams = () => React.useContext(RouterContext).params;

export const Link = ({ to, onClick, children, ...props }) => {
    const navigate = useNavigate();
    return (
        <a
            {...props}
            href={normalizePath(to)}
            onClick={(event) => {
                onClick?.(event);
                if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                navigate(to);
            }}
        >
            {children}
        </a>
    );
};
