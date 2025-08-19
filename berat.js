import React, { useState, useRef, useEffect } from 'react';

// Use this to get the user ID and initialize Firestore
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot } from 'firebase/firestore';

// Define the main App component
const App = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', text: 'Halo! Saya adalah teman curhat AI Anda. Silakan bercerita, saya siap mendengarkan.' }
  ]);
  const [userInput, setUserInput] = useState('');
  const chatContainerRef = useRef(null);

  // Firestore & Auth State
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Initialize Firebase
  useEffect(() => {
    try {
      // Access global variables provided by the environment
      const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
      const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          console.log('User signed in:', user.uid);
          setUserId(user.uid);
        } else {
          console.log('User signed out, signing in anonymously...');
          if (initialAuthToken) {
            await signInWithCustomToken(firebaseAuth, initialAuthToken);
          } else {
            await signInAnonymously(firebaseAuth);
          }
        }
        setIsAuthReady(true);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Firebase initialization failed:", e);
    }
  }, []);

  // Set up Firestore listener for chat history
  useEffect(() => {
    if (db && userId) {
      const q = query(
        collection(db, `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/users/${userId}/chat`),
        orderBy('timestamp', 'asc')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const history = snapshot.docs.map(doc => doc.data());
        if (history.length > 0) {
          setChatHistory(history);
        }
      }, (error) => {
        console.error("Error fetching chat history:", error);
      });

      return () => unsubscribe();
    }
  }, [db, userId]);

  // Scroll to the bottom of the chat on new messages
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (userInput.trim() === '' || isTyping) return;

    const newUserMessage = { role: 'user', text: userInput, timestamp: new Date() };

    // Update local state and save to Firestore
    setChatHistory(prev => [...prev, newUserMessage]);
    await saveMessage(newUserMessage);

    setIsTyping(true);

    // Call the Gemini API for a response
    try {
      const prompt = `Anda adalah teman curhat AI yang suportif dan empatik. Balas pesan berikut dengan gaya santai dan ramah seperti teman, tanpa formalitas. Bicaralah dalam bahasa yang sama dengan pesan pengguna.

      Riwayat Percakapan:
      ${chatHistory.map(msg => `${msg.role === 'user' ? 'Pengguna' : 'Anda'}: ${msg.text}`).join('\n')}
      Pengguna: ${userInput}
      Anda:`;

      const payload = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      };

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      const assistantMessageText = result?.candidates?.[0]?.content?.parts?.[0]?.text || 'Maaf, ada kesalahan. Coba lagi nanti.';
      const newAssistantMessage = { role: 'assistant', text: assistantMessageText, timestamp: new Date() };

      // Update local state and save to Firestore
      setChatHistory(prev => [...prev, newAssistantMessage]);
      await saveMessage(newAssistantMessage);

    } catch (error) {
      console.error('Error calling Gemini API:', error);
      const errorMessage = { role: 'assistant', text: 'Maaf, ada masalah teknis. Coba lagi sebentar ya.', timestamp: new Date() };
      setChatHistory(prev => [...prev, errorMessage]);
      await saveMessage(errorMessage);
    } finally {
      setIsTyping(false);
      setUserInput('');
    }
  };

  const saveMessage = async (message) => {
    if (db && userId) {
      try {
        await addDoc(collection(db, `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/users/${userId}/chat`), {
          ...message,
          timestamp: serverTimestamp()
        });
      } catch (e) {
        console.error("Error adding document: ", e);
      }
    } else {
      console.warn("Firestore not initialized. Message will not be saved.");
    }
  };

  const menuItems = [
    { id: 'home', label: 'Beranda', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-home"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    ) },
    { id: 'galau', label: 'Ruang Galau', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-frown"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><path d="M9 9.01V9"/><path d="M15 9.01V9"/></svg>
    ) },
    { id: 'patahhati', label: 'Obat Patah Hati', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-heart-crack"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="m12 14-3 3"/><path d="m15 11-3 3"/><path d="m19 14-3 3"/></svg>
    ) },
    { id: 'curhat', label: 'Chatbot Curhat', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-square"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    ) }
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <div className="text-center p-8 bg-white/50 backdrop-blur-sm rounded-3xl shadow-xl space-y-4 animate-fade-in-up">
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-800">Selamat datang di Ruang Hati</h1>
            <p className="text-lg md:text-xl text-gray-600">Tempat untuk mencurahkan semua rasa di dalam hati.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 transition-all duration-300 hover:scale-105 hover:shadow-2xl">
                <h3 className="text-2xl font-bold text-indigo-600">Ruang Galau</h3>
                <p className="mt-2 text-gray-500">Puisi dan kutipan untuk hati yang sedang gundah.</p>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 transition-all duration-300 hover:scale-105 hover:shadow-2xl">
                <h3 className="text-2xl font-bold text-red-500">Obat Patah Hati</h3>
                <p className="mt-2 text-gray-500">Kata-kata penenang dan inspirasi untuk bangkit kembali.</p>
              </div>
              <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-lg border border-gray-100 transition-all duration-300 hover:scale-105 hover:shadow-2xl">
                <h3 className="text-2xl font-bold text-teal-600">Chatbot Curhat</h3>
                <p className="mt-2 text-gray-500">Teman AI yang selalu siap mendengarkan cerita Anda.</p>
              </div>
            </div>
          </div>
        );
      case 'galau':
        return (
          <div className="text-center p-8 bg-white/50 backdrop-blur-sm rounded-3xl shadow-xl space-y-4 animate-fade-in-up">
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-800">Ruang Galau</h2>
            <p className="text-lg md:text-xl text-gray-600">Kata-kata yang mengerti perasaanmu.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 transform rotate-[-2deg] transition-all duration-300 hover:rotate-0 hover:scale-105">
                <p className="italic text-gray-700">"Hujan turun, membasahi kenangan. Seperti air mata yang tak bisa ditahan, rinduku padamu tak pernah kering."</p>
                <span className="block mt-4 text-sm text-gray-500">- anonim</span>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 transform rotate-[2deg] transition-all duration-300 hover:rotate-0 hover:scale-105">
                <p className="italic text-gray-700">"Kamu adalah melodi yang paling indah, namun liriknya adalah patah hati yang paling menyakitkan."</p>
                <span className="block mt-4 text-sm text-gray-500">- anonim</span>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 transform rotate-[-1deg] transition-all duration-300 hover:rotate-0 hover:scale-105">
                <p className="italic text-gray-700">"Dalam diamku, ada ribuan kata yang ingin kuucapkan. Namun, suaraku tak berani, karena takut kau tak ingin mendengarkan."</p>
                <span className="block mt-4 text-sm text-gray-500">- anonim</span>
              </div>
            </div>
          </div>
        );
      case 'patahhati':
        return (
          <div className="text-center p-8 bg-white/50 backdrop-blur-sm rounded-3xl shadow-xl space-y-4 animate-fade-in-up">
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-800">Obat Patah Hati</h2>
            <p className="text-lg md:text-xl text-gray-600">Langkah-langkah kecil untuk kembali tersenyum.</p>
            <div className="grid grid-cols-1 gap-6 mt-8">
              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 text-left transition-all duration-300 hover:scale-105">
                <h3 className="text-2xl font-bold text-red-500">1. Terima Perasaanmu</h3>
                <p className="mt-2 text-gray-700">Tidak apa-apa untuk merasa sedih. Biarkan emosi itu mengalir dan jangan menahannya. Menerima adalah langkah pertama untuk sembuh.</p>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 text-left transition-all duration-300 hover:scale-105">
                <h3 className="text-2xl font-bold text-red-500">2. Jaga Dirimu</h3>
                <p className="mt-2 text-gray-700">Makan makanan sehat, tidur yang cukup, dan lakukan hal-hal yang kamu nikmati. Prioritaskan kebahagiaanmu sendiri.</p>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 text-left transition-all duration-300 hover:scale-105">
                <h3 className="text-2xl font-bold text-red-500">3. Curhat ke Teman</h3>
                <p className="mt-2 text-gray-700">Bicaralah dengan seseorang yang kamu percaya, atau manfaatkan fitur Chatbot Curhat di sini. Berbagi cerita bisa meringankan beban.</p>
              </div>
            </div>
          </div>
        );
      case 'curhat':
        return (
          <div className="flex flex-col h-full bg-white/50 backdrop-blur-sm rounded-3xl shadow-xl animate-fade-in-up">
            <div ref={chatContainerRef} className="flex-1 p-6 overflow-y-auto custom-scrollbar">
              {chatHistory.map((message, index) => (
                <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
                  <div className={`p-4 rounded-xl max-w-[75%] shadow-md ${message.role === 'user' ? 'bg-indigo-500 text-white rounded-br-none' : 'bg-gray-200 text-gray-800 rounded-bl-none'}`}>
                    {message.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start mb-4">
                  <div className="p-4 rounded-xl max-w-[75%] bg-gray-200 text-gray-800 rounded-bl-none shadow-md">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce200"></div>
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce400"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 flex space-x-2">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Ketuk di sini untuk curhat..."
                className="flex-1 px-4 py-3 bg-white rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                disabled={isTyping}
              />
              <button
                type="submit"
                className="bg-indigo-600 text-white p-3 rounded-full shadow-lg transition-transform transform hover:scale-105 active:scale-95 disabled:bg-gray-400"
                disabled={isTyping || userInput.trim() === ''}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-send-horizontal"><path d="m3 3 3 9-3 9 19-9Z"/><path d="M6 12h16"/></svg>
              </button>
            </form>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 font-sans text-gray-900 overflow-x-hidden">
      {/* Sidebar Nav (Mobile) */}
      <div className={`fixed inset-y-0 left-0 w-64 bg-gray-900 bg-opacity-90 backdrop-blur-sm z-50 transform ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out md:hidden`}>
        <div className="p-6">
          <button onClick={() => setIsMenuOpen(false)} className="absolute top-4 right-4 text-white hover:text-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
          <div className="flex flex-col space-y-4 mt-8">
            {menuItems.map(item => (
              <a
                key={item.id}
                href="#"
                onClick={() => { setActiveTab(item.id); setIsMenuOpen(false); }}
                className={`flex items-center space-x-3 px-4 py-2 rounded-xl transition-colors duration-200 ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}
              >
                {item.icon}
                <span className="font-semibold">{item.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="relative flex flex-col md:flex-row min-h-screen">
        {/* Sidebar Nav (Desktop) */}
        <div className="hidden md:flex flex-col w-64 p-6 bg-white/70 backdrop-blur-sm border-r border-gray-100 shadow-xl z-20 transition-all duration-300 ease-in-out rounded-r-3xl my-6 ml-6">
          <div className="flex items-center justify-center p-4">
            <h2 className="text-2xl font-extrabold text-gray-800">Ruang Hati</h2>
          </div>
          <nav className="flex-1 mt-8 space-y-2">
            {menuItems.map(item => (
              <a
                key={item.id}
                href="#"
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all duration-300 ease-in-out transform hover:translate-x-1 ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-600 hover:bg-indigo-100 hover:text-indigo-800'}`}
              >
                {item.icon}
                <span className="font-medium">{item.label}</span>
              </a>
            ))}
          </nav>
          {userId && (
            <div className="mt-auto p-4 text-sm text-center text-gray-500">
              ID Pengguna: <br/>
              <span className="break-all font-mono text-gray-700">{userId}</span>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col p-4 md:p-8">
          {/* Header (Mobile) */}
          <header className="flex items-center justify-between p-4 bg-white/70 backdrop-blur-sm rounded-3xl shadow-xl md:hidden mb-4">
            <button onClick={() => setIsMenuOpen(true)} className="p-2 text-gray-600 hover:text-gray-800">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-menu"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </button>
            <h1 className="text-xl font-extrabold text-gray-800">Ruang Hati</h1>
            <div className="w-8"></div> {/* Placeholder for alignment */}
          </header>

          <main className="flex-1 flex justify-center items-center p-4 md:p-0">
            {renderContent()}
          </main>
        </div>
      </div>
    </div>
  );
};

export default App;
