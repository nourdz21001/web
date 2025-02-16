// استخدام متغيرات Firebase من window.app
const app = window.app;
const auth = app.auth;
const db = app.db;

// التحقق من وجود مشرف
async function checkForAdmin() {
    try {
        console.log('جاري التحقق من وجود مشرف...');
        const usersSnapshot = await db.collection('users').where('role', '==', 'admin').limit(1).get();
        const setupSection = document.getElementById('setupSection');
        
        if (setupSection) {
            if (usersSnapshot.empty) {
                setupSection.classList.remove('d-none');
                console.log('لا يوجد مشرف، إظهار زر إنشاء حساب المشرف');
            } else {
                setupSection.classList.add('d-none');
                console.log('يوجد مشرف بالفعل، إخفاء زر إنشاء حساب المشرف');
            }
        }
    } catch (error) {
        console.error('Error checking for admin:', error);
        showError('حدث خطأ في التحقق من وجود مشرف');
    }
}

// إنشاء حساب المشرف الأول
async function createAdminAccount() {
    const loadingScreen = document.getElementById('loadingScreen');
    const createAdminBtn = document.getElementById('createAdminBtn');
    
    try {
        if (loadingScreen) loadingScreen.classList.remove('d-none');
        if (createAdminBtn) createAdminBtn.disabled = true;

        console.log('بدء عملية إنشاء حساب المشرف...');

        // تعيين المتغير لمنع إعادة التوجيه التلقائي
        window.app.isCreatingNewUser = true;

        // التحقق من عدم وجود مشرف
        console.log('التحقق من عدم وجود مشرف...');
        const adminCheck = await db.collection('users').where('role', '==', 'admin').limit(1).get();
        if (!adminCheck.empty) {
            console.log('يوجد مشرف بالفعل!');
            throw new Error('يوجد مشرف بالفعل');
        }

        // إنشاء حساب المشرف
        const adminEmail = 'nourdz21001@gmail.com';
        const adminPassword = 'nourdz21001@A';
        
        console.log('إنشاء حساب المصادقة...');
        const userCredential = await auth.createUserWithEmailAndPassword(adminEmail, adminPassword);
        const user = userCredential.user;

        console.log('تم إنشاء حساب المصادقة بنجاح، جاري إضافة معلومات المشرف...');

        // إضافة معلومات المشرف إلى Firestore
        const userData = {
            email: adminEmail,
            role: 'admin',
            name: 'المشرف',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('users').doc(user.uid).set(userData);
        console.log('تم إضافة معلومات المشرف بنجاح');

        showAlert('تم إنشاء حساب المشرف بنجاح. يمكنك الآن تسجيل الدخول باستخدام البريد الإلكتروني وكلمة المرور.', 'success');
        
        // إعادة تعيين المتغير
        window.app.isCreatingNewUser = false;

        // إعادة تحميل الصفحة بعد ثانيتين
        setTimeout(() => {
            window.location.reload();
        }, 2000);
    } catch (error) {
        console.error('Error creating admin account:', error);
        let errorMessage = 'حدث خطأ في إنشاء حساب المشرف';
        
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'البريد الإلكتروني مستخدم بالفعل';
            console.log('البريد الإلكتروني مستخدم بالفعل');
        } else if (error.message === 'يوجد مشرف بالفعل') {
            errorMessage = error.message;
            console.log('يوجد مشرف بالفعل');
        }
        
        showError(errorMessage);
    } finally {
        window.app.isCreatingNewUser = false;
        if (loadingScreen) loadingScreen.classList.add('d-none');
        if (createAdminBtn) createAdminBtn.disabled = false;
    }
}

// تسجيل الدخول
async function loginUser(email, password) {
    const loadingScreen = document.getElementById('loadingScreen');
    const submitButton = document.querySelector('#loginForm button[type="submit"]');
    
    try {
        if (loadingScreen) loadingScreen.classList.remove('d-none');
        if (submitButton) submitButton.disabled = true;

        console.log('محاولة تسجيل الدخول للمستخدم:', email);

        // تعيين المتغير لمنع إعادة التوجيه التلقائي
        window.app.isCreatingNewUser = true;

        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        console.log('تم تسجيل الدخول بنجاح، جاري التحقق من الصلاحيات...');

        // التحقق من وجود وثيقة المستخدم
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        console.log('معلومات المستخدم:', userDoc.exists ? userDoc.data() : 'لا يوجد معلومات');
        
        if (!userDoc.exists) {
            console.log('إنشاء وثيقة جديدة للمستخدم...');
            // إذا لم تكن هناك وثيقة للمستخدم، قم بإنشائها
            const userData = {
                email: user.email,
                name: user.displayName || 'مستخدم',
                role: 'user',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await db.collection('users').doc(user.uid).set(userData);
            console.log('تم إنشاء وثيقة المستخدم بنجاح');
        }

        const userData = userDoc.exists ? userDoc.data() : { role: 'user' };

        // إعادة تعيين المتغير
        window.app.isCreatingNewUser = false;

        if (userData.role === 'admin') {
            // إذا كان المستخدم مشرفاً، توجيهه إلى لوحة التحكم
            console.log('المستخدم مشرف، جاري التوجيه إلى لوحة التحكم...');
            window.location.href = 'admin.html';
        } else {
            // إذا كان مستخدماً عادياً، توجيهه إلى الصفحة الرئيسية
            console.log('المستخدم عادي، جاري التوجيه إلى الصفحة الرئيسية...');
            window.location.href = 'home.html';
        }
    } catch (error) {
        console.error('Login error:', error);
        console.log('Error code:', error.code);
        console.log('Error message:', error.message);
        
        let errorMessage = 'حدث خطأ في تسجيل الدخول';
        
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = 'البريد الإلكتروني غير مسجل';
                break;
            case 'auth/wrong-password':
                errorMessage = 'كلمة المرور غير صحيحة';
                break;
            case 'auth/invalid-email':
                errorMessage = 'البريد الإلكتروني غير صالح';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'تم تجاوز عدد المحاولات المسموح بها. الرجاء المحاولة لاحقاً';
                break;
            case 'auth/invalid-login-credentials':
                errorMessage = 'بيانات تسجيل الدخول غير صحيحة';
                break;
        }

        showError(errorMessage);
    } finally {
        window.app.isCreatingNewUser = false;
        if (loadingScreen) loadingScreen.classList.add('d-none');
        if (submitButton) submitButton.disabled = false;
    }
}

// عرض رسالة خطأ
function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('d-none');
    }
}

// عرض تنبيه
function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    const form = document.getElementById('loginForm');
    if (form) {
        form.insertBefore(alertDiv, form.firstChild);
    }
    
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// إعداد مستمعي الأحداث
document.addEventListener('DOMContentLoaded', function() {
    // التحقق من حالة تسجيل الدخول
    let isCreatingNewUser = false; // متغير للتحكم في عملية إنشاء المستخدم

    // إضافة المتغير إلى window.app للوصول إليه من ملفات أخرى
    window.app.isCreatingNewUser = false;

    auth.onAuthStateChanged(async function(user) {
        const loadingScreen = document.getElementById('loadingScreen');
        
        try {
            if (loadingScreen) loadingScreen.classList.remove('d-none');

            // تجاهل التغييرات في حالة المصادقة إذا كنا نقوم بإنشاء مستخدم جديد
            if (window.app.isCreatingNewUser) {
                console.log('جاري إنشاء مستخدم جديد، تجاهل تغيير حالة المصادقة');
                if (loadingScreen) loadingScreen.classList.add('d-none');
                return;
            }

            // تحقق مما إذا كنا في صفحة تسجيل الدخول
            const isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');
            
            if (!user) {
                console.log('المستخدم غير مسجل الدخول');
                if (!isLoginPage) {
                    window.location.href = 'index.html';
                }
                if (loadingScreen) loadingScreen.classList.add('d-none');
                return;
            }

            // التحقق من صلاحيات المستخدم
            console.log('التحقق من صلاحيات المستخدم...');
            const userDoc = await db.collection('users').doc(user.uid).get();
            
            if (!userDoc.exists) {
                console.log('لم يتم العثور على وثيقة المستخدم');
                await auth.signOut();
                window.location.href = 'index.html';
                return;
            }

            const userData = userDoc.data();
            console.log('دور المستخدم:', userData.role);
            
            if (isLoginPage) {
                if (userData.role === 'admin') {
                    console.log('توجيه المشرف إلى لوحة التحكم...');
                    window.location.href = 'admin.html';
                } else {
                    console.log('توجيه المستخدم إلى الصفحة الرئيسية...');
                    window.location.href = 'home.html';
                }
                return;
            }

            // إذا كنا في صفحة admin.html، تأكد من أن المستخدم مشرف
            if (window.location.pathname.includes('admin.html')) {
                if (userData.role !== 'admin') {
                    console.log('المستخدم ليس مشرفاً، جاري تسجيل الخروج...');
                    await auth.signOut();
                    window.location.href = 'index.html';
                    return;
                }

                console.log('تحديث واجهة المشرف...');
                // تحديث اسم المستخدم في الواجهة
                const userDisplayName = document.getElementById('userDisplayName');
                if (userDisplayName) {
                    userDisplayName.textContent = userData.name || 'المشرف';
                }

                // تحميل قائمة المستخدمين إذا كانت الدالة موجودة
                if (typeof window.loadUsers === 'function') {
                    console.log('تحميل قائمة المستخدمين...');
                    await window.loadUsers();
                } else {
                    console.log('دالة loadUsers غير معرفة');
                }
            }
        } catch (error) {
            console.error('Error in auth state change:', error);
            showError('حدث خطأ في التحقق من حالة المستخدم');
        } finally {
            if (loadingScreen) loadingScreen.classList.add('d-none');
        }
    });

    // مستمع نموذج تسجيل الدخول
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(event) {
            event.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            loginUser(email, password);
        });
    }

    // مستمع زر إنشاء حساب المشرف
    const createAdminBtn = document.getElementById('createAdminBtn');
    if (createAdminBtn) {
        createAdminBtn.addEventListener('click', createAdminAccount);
    }

    // التحقق من وجود مشرف
    checkForAdmin();
});

// تحديث وظائف التطبيق
Object.assign(window.app, {
    logout: function() {
        auth.signOut().then(() => {
            window.location.href = 'index.html';
        }).catch((error) => {
            console.error('Error signing out:', error);
            showError('حدث خطأ في تسجيل الخروج');
        });
    }
});
