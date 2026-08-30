import React from 'react';
import { Link } from '../utils/clientRouter';

const SaskatAINav = () => {
    return (
        <Link to="/saskat-ai" className="nav-item saskat-ai-nav">
            <span className="nav-icon">🤖</span>
            <span className="nav-label">Saskat AI</span>
        </Link>
    );
};

export default SaskatAINav;
