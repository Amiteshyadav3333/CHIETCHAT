import React from 'react';
import IncomingCallModal from '../../../components/IncomingCallModal';
import VideoCallModal from '../../../components/VideoCall';

export const CallOverlayContainer = ({
    showCallModal,
    setShowCallModal,
    callType,
    callRingState,
    preparedCallStreamRef,
    incomingCall,
    acceptCall,
    rejectCall,
    activeChat,
    setActiveChat,
    fetchChats,
    token,
}) => {
    return (
        <>
            {incomingCall && (
                <IncomingCallModal
                    callerName={incomingCall.callerName}
                    callType={incomingCall.callType}
                    onAccept={acceptCall}
                    onReject={rejectCall}
                    playSound={localStorage.getItem('call_sounds') !== '0'}
                    chatId={incomingCall.chatId}
                />
            )}

            {showCallModal && (
                <VideoCallModal 
                    activeChat={activeChat} 
                    onClose={() => setShowCallModal(false)} 
                    callType={callType} 
                    initialRingStatus={callRingState[activeChat?.id] || 'calling'}
                    token={token}
                    preparedStream={preparedCallStreamRef.current}
                    onPreparedStreamConsumed={() => { preparedCallStreamRef.current = null; }}
                    onTransitionCall={async (newChatId) => {
                        if (fetchChats) {
                            const updatedChats = await fetchChats();
                            const newChatObj = updatedChats.find(c => c.id === newChatId);
                            if (newChatObj && setActiveChat) {
                                setActiveChat(newChatObj);
                            }
                        }
                    }}
                />
            )}
        </>
    );
};
