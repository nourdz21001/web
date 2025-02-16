// التحقق من حالة المصادقة عند تحميل الصفحة
firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        try {
            const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
            const userData = userDoc.data();
            
            if (userData?.role === 'admin') {
                // إذا كان المستخدم مشرفاً، قم بتوجيهه مباشرة إلى لوحة التحكم
                window.location.href = 'admin.html';
            }
        } catch (error) {
            console.error('خطأ في التحقق من صلاحيات المستخدم:', error);
        }
    }
});

// دوال مساعدة
const setupAdmin = {
    // ...existing code...

    async createAdminUser(email, password, name) {
        try {
            this.updateProgress(25);
            
            // إنشاء المستخدم
            const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
            
            this.updateProgress(50);
            
            // تحديث اسم المستخدم
            await userCredential.user.updateProfile({
                displayName: name
            });
            
            this.updateProgress(75);
            
            // إضافة معلومات المستخدم إلى Firestore
            await firebase.firestore().collection('users').doc(userCredential.user.uid).set({
                name: name,
                email: email,
                role: 'admin',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            this.updateProgress(100);
            
            // إعادة تحميل بيانات المستخدم
            await firebase.auth().currentUser.reload();
            
            return userCredential.user;
        } catch (error) {
            console.error('خطأ في إنشاء حساب المشرف:', error);
            throw error;
        }
    }
};

// إعداد مستمعي الأحداث
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('adminSetupForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('adminName').value;
        const email = document.getElementById('adminEmail').value;
        const password = document.getElementById('adminPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        // التحقق من صحة المدخلات
        if (!name || !email || !password || !confirmPassword) {
            setupAdmin.showError('يرجى ملء جميع الحقول');
            return;
        }
        
        if (!setupAdmin.validatePassword(password)) {
            setupAdmin.showError('يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل');
            return;
        }
        
        if (password !== confirmPassword) {
            setupAdmin.showError('كلمتا المرور غير متطابقتين');
            return;
        }
        
        setupAdmin.toggleLoading(true);
        
        try {
            const user = await setupAdmin.createAdminUser(email, password, name);
            setupAdmin.showSuccess('تم إنشاء حساب المشرف بنجاح!');
            
            // إعادة التوجيه بعد تأخير قصير
            setTimeout(() => {
                if (firebase.auth().currentUser) {
                    window.location.href = 'admin.html';
                }
            }, 1500);
        } catch (error) {
            let errorMessage = 'حدث خطأ أثناء إنشاء الحساب';
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = 'البريد الإلكتروني مستخدم بالفعل';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = 'البريد الإلكتروني غير صالح';
            } else if (error.code === 'auth/weak-password') {
                errorMessage = 'كلمة المرور ضعيفة جداً';
            }
            setupAdmin.showError(errorMessage);
        } finally {
            setupAdmin.toggleLoading(false);
        }
    });
});