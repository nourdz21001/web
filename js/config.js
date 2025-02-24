// تكوين Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDsYp0tB9hBAnbrE51v1NEDSFs0-5KWg6M",
    authDomain: "nourdz-6afd2.firebaseapp.com",
    projectId: "nourdz-6afd2",
    storageBucket: "nourdz-6afd2.appspot.com",
    messagingSenderId: "694798603836",
    appId: "1:694798603836:web:362c146ba5e0369d809539",
    measurementId: "G-SCPYDVCH6W"
};

// تكوين ImgBB
const imgbbConfig = {
    apiKey: '3d09cfe3f9e58194b84569e1f3250078'
};

// تهيئة Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// تصدير المتغيرات
window.app = {
    auth: firebase.auth(),
    db: firebase.firestore(),
    imgbbConfig,
    // دالة رفع الصور إلى ImgBB
    uploadImage: async function(file) {
        const formData = new FormData();
        formData.append('image', file);
        
        try {
            const response = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbConfig.apiKey}`, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                return {
                    url: data.data.url,
                    delete_url: data.data.delete_url,
                    thumb: data.data.thumb.url
                };
            } else {
                throw new Error('فشل رفع الصورة');
            }
        } catch (error) {
            console.error('خطأ في رفع الصورة:', error);
            throw error;
        }
    }
};

// دالة رفع الصور إلى ImgBB
window.app.uploadImage = async function(file) {
    const formData = new FormData();
    formData.append('image', file);
    
    try {
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbConfig.apiKey}`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            return {
                url: data.data.url,
                delete_url: data.data.delete_url,
                thumb: data.data.thumb.url
            };
        } else {
            throw new Error('فشل رفع الصورة');
        }
    } catch (error) {
        console.error('خطأ في رفع الصورة:', error);
        throw error;
    }
};

