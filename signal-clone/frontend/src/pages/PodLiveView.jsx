import React from 'react';
import PodLiveApp from '../features/podlive/PodLiveApp';

const PodLiveView = ({ active, onBack }) => {
    return <PodLiveApp active={active} onBack={onBack} />;
};

export default PodLiveView;
